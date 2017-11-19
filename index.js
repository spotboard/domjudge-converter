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

const loadContest = async function(cid) {
    console.log('Fetching contest ...');
    const ret = (await axios.get('contests')).data[cid];
    console.log('Fetching contest ... finished!!!');
    return ret;
};
const loadTeams = async function(sortorder) {
    console.log('Fetching teams ...');
    let [categories, teams] = (await Promise.all([
        axios.get('categories', {params: {public: true}}),
        axios.get('teams', {params: {public: true}}),
    ])).map(e => e.data);
    categories = categories.filter(e => e.sortorder === sortorder).reduce((acc, cur) => {
        acc[cur.categoryid] = cur;
        return acc;
    }, {});
    teams = teams.filter(e => categories[e.category]).reduce((acc, cur) => {
        acc[cur.id] = cur;
        return acc;
    }, {});;
    console.log('Fetching teams ... finished!!!');
    return teams;
};
const loadProblems = async function(cid) {
    console.log('Fetching problems ...');
    const ret = (await axios.get('problems', {params: {cid}})).data.sort((a, b) => {
        if (a.short_name < b.short_name) return -1;
        if (a.short_name > b.short_name) return 1;
        return 0;
    });
    console.log('Fetching problems ... finished');
    return ret;
};
const loadSubmissions = async function(cid) {
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
    submissions = submissions.map(e => {
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
    submissions = submissions.filter(e => e.outcome !== 'No - Compilation Error');
    console.log('Fetching submissions ... finished!!!');
    return submissions;
};

const writeContest = async function(contest, teams, problems) {
    console.log('Writing into contest.json ...');
    const getTeamName = t => t.affiliation ? `${t.name} (${t.affiliation})` : t.name;
    teams = Object.values(teams).map(e => ({
        id: e.id,
        name: getTeamName(e),
    }));
    problems = problems.map((e, idx) => ({
        id: idx,
        title: e.name,
        name: e.short_name,
        color: e.color || '',
    }));
    contest = {
        title: contest.name,
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
};
const writeRuns = async function(contest, problems, submissions) {
    console.log('Writing into runs.json ...');
    const now = Date.now() / 1000;
    const frozen = (contest.freeze && now >= contest.freeze) && !(config.unfreeze || contest.unfreeze && now >= contest.unfreeze);

    problemIdToIdx = problems.reduce((acc, cur, idx) => {
        acc[cur.id] = idx;
        return acc;
    }, {});

    let data = {
        time: {
            contestTime: Math.max(0, Math.min(Math.floor(now-contest.start), contest.length)),
            noMoreUpdate: frozen,
            timestamp: 0,
        },
    };

    // Remove outcome of submission which submitted after freeze.
    submissions = submissions.map(e => {
        let x = {...e};
        if (frozen && e.time >= contest.freeze) x.outcome = '';
        return x;
    });

    data.runs = submissions.map(e => ({
        id: e.id,
        problem: problemIdToIdx[e.problem],
        team: e.team,
        result: e.outcome,
        submissionTime: Math.floor((e.time - contest.start) / 60),
    }));
    await new Promise((resolve, reject) => {
        fs.writeFile(path.join(config.dest, 'runs.json'), JSON.stringify(data, null, 4), err => {
            if (err) reject(err);
            resolve(true);
        });
    });
    console.log('Writing into runs.json ... finished!!!');
};

main = async function() {
    const {cid, sortorder} = config.filter;
    let [contest, teams, problems, submissions] = await Promise.all([
        loadContest(cid),
        loadTeams(sortorder),
        loadProblems(cid),
        loadSubmissions(cid),
    ]);
    console.log('======================\n');

    // Filter submissions by teams here.
    submissions = submissions.filter(e => teams[e.team]);
    // Ignore too-late submissions
    submissions = submissions.filter(e => e.time < contest.end);

    await Promise.all([
        writeContest(contest, teams, problems),
        writeRuns(contest, problems, submissions),
    ]);
    console.log('======================\n');
};

const runMain = () => {
    main()
        .then(() => {
            if (config.interval)
                setTimeout(runMain, config.interval);
        })
        .catch(err => {
            if (err.toString) console.error(err.toString());
            else console.error(err);
        });
};

runMain();
