const config = require('./config');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const axios = require('axios').create({
    baseURL: config.domjudge.api,
    timeout: config.axios.timeout || 3000,
    auth: {
        username: config.domjudge.username,
        password: config.domjudge.password,
    },
});

class DOMjudgeConverter {
    constructor() {
        const {cid, sortorder} = config.filter;
        this.cid = cid;
        this.sortorder = sortorder;
    }

    async loadConfig() {
        console.log('Fetching config ...');
        this.config = (await axios.get('config')).data;
        console.log('Fetching config ... finished!!!');
    }

    async loadContest() {
        console.log('Fetching contest ...');
        this.contest = (await axios.get('contests')).data[this.cid];
        console.log('Fetching contest ... finished!!!');
    }

    async loadTeams() {
        console.log('Fetching teams ...');
        let [categories, teams] = (await Promise.all([
            axios.get('categories', {params: {public: true}}),
            axios.get('teams', {params: {public: true}}),
        ])).map(e => e.data);
        categories = categories.filter(e => e.sortorder === this.sortorder).reduce((acc, cur) => {
            acc[cur.categoryid] = cur;
            return acc;
        }, {});
        this.teams = teams.filter(e => categories[e.category]);
        this.teamIdToObj = this.teams.reduce((acc, cur) => {
            acc[cur.id] = cur;
            return acc;
        }, {});
        console.log('Fetching teams ... finished!!!');
    }

    async loadProblems() {
        const {cid} = this;
        console.log('Fetching problems ...');
        this.problems = (await axios.get('problems', {params: {cid}})).data.sort((a, b) => {
            if (a.short_name < b.short_name) return -1;
            if (a.short_name > b.short_name) return 1;
            return 0;
        });
        this.problemIdToIdx = this.problems.reduce((acc, cur, idx) => {
            acc[cur.id] = idx;
            return acc;
        }, {});
        console.log('Fetching problems ... finished');
    }

    async loadSubmissions() {
        const {cid} = this;
        console.log('Fetching submissions ...');
        let [submissions, judgings] = (await Promise.all([
            axios.get('submissions', {params: {cid}}),
            axios.get('judgings', {params: {cid}}),
        ])).map(e => e.data);
        judgings = judgings.reduce((acc, cur) => {
            acc[cur.submission] = cur;
            return acc;
        }, {});
        // Merge judgings and submission.
        this.submissions = submissions.map(e => {
            let j = judgings[e.id];
            let outcome = j && j.outcome || '';
            let x = {...e, outcome};

            // DOMjudge's judging outcome to Spotboard result
            if (!x.outcome) x.outcome = 'judging';
            x.outcome = {
                'correct': 'Yes',
                'wrong-answer': 'No - Wrong Answer',
                'timelimit': 'No - Time Limit Exceeded',
                'run-error': 'No - Run-time Error',
                'compiler-error': 'No - Compilation Error',
                'no-output': 'No - Other',
                'output-limit': 'No - Output Limit Exceeded',
                'judging': '',
            }[x.outcome];
            // Assertion for lack of DOMjudge outcome map
            assert(typeof x.outcome === 'string', `Unknown judging outcome: ${outcome}`);

            return x;
        });

        // Ignore compile error submissions
        if (!this.config['compile_penalty'])
            this.submissions = this.submissions.filter(e => e.outcome !== 'No - Compilation Error');
        console.log('Fetching submissions ... finished!!!');
    }

    async writeContest() {
        console.log('Writing into contest.json ...');
        const teams = this.teams.map(e => ({
            id: e.id,
            name: e.name,
            group: e.affiliation,
        }));
        const problems = this.problems.map((e, idx) => ({
            id: idx,
            title: e.name,
            name: e.short_name,
            color: e.color || '',
        }));
        const contest = {
            title: this.contest.name,
            systemName: 'DOMjudge',
            systemVersion: config.domjudge.version || '',
            problems,
            teams,
        };
        await new Promise((resolve, reject) => {
            fs.writeFile(path.join(config.dest, 'contest.json'), JSON.stringify(contest, null, 4), err => {
                if (err) reject(err);
                resolve(true);
            });
        });
        console.log('Writing into contest.json ... finished!!!');
    }

    async writeRuns() {
        const {contest, now} = this;
        console.log('Writing into runs.json ...');

        const data = {
            time: {
                contestTime: Math.max(0, Math.min(Math.floor(now-contest.start), contest.length)),
                noMoreUpdate: this.frozen,
                timestamp: 0,
            },
            runs: this.submissions.map(e => ({
                id: e.id,
                problem: this.problemIdToIdx[e.problem],
                team: e.team,
                result: e.outcome,
                submissionTime: Math.floor((e.time - contest.start) / 60),
            })),
        };

        await new Promise((resolve, reject) => {
            fs.writeFile(path.join(config.dest, 'runs.json'), JSON.stringify(data, null, 4), err => {
                if (err) reject(err);
                resolve(true);
            });
        });
        console.log('Writing into runs.json ... finished!!!');
    };

    async do() {
        await Promise.all([
            this.loadConfig(),
            this.loadContest(),
            this.loadTeams(),
            this.loadProblems(),
            this.loadSubmissions(),
        ]);
        console.log('======================\n');

        this.now = Date.now() / 1000;
        const {contest, now} = this;
        this.frozen = (contest.freeze && now >= contest.freeze) && !(config.unfreeze || contest.unfreeze && now >= contest.unfreeze);
        const {frozen} = this;

        // Filter submissions by teams here.
        this.submissions = this.submissions.filter(e => this.teamIdToObj[e.team]);
        // Ignore too-late submissions
        this.submissions = this.submissions.filter(e => e.time < this.contest.end);
        // Remove outcome of submission which submitted after freeze.
        this.submissions = this.submissions.map(e => {
            let x = {...e};
            if (frozen && e.time >= contest.freeze) x.outcome = '';
            return x;
        });
        // No pending submission after frozen
        if (!this.config['show_pending'] && !config.unfreeze)
            this.submissions = this.submissions.filter(e => !(frozen && e.time >= contest.freeze));

        await Promise.all([
            this.writeContest(),
            this.writeRuns(),
        ]);
        console.log('======================\n');
    }
};

const converter = new DOMjudgeConverter();

const run = () => {
    converter.do()
        .then(() => {
            if (config.interval)
                setTimeout(run, config.interval);
        })
        .catch(err => {
            if (err.toString) console.error(err.toString());
            else console.error(err);
        });
};

run();
