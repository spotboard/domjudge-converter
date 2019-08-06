const config = require('./config');
const fs = require('fs');
const path = require('path');
const axios = require('axios').create({
    baseURL: config.domjudge.api + '/v4',
    timeout: config.axios.timeout || 3000,
    auth: {
        username: config.domjudge.username,
        password: config.domjudge.password,
    },
});

class DOMjudgeConverter {
    constructor() {
        const { cid } = config.filter;
        this.cid = cid;
    }

    async loadApiMain() {
        console.log('Fetching api info ...');

        try{
            const domjudge_info = (await axios.get('')).data;
            this.domjudgeVersion = domjudge_info.domjudge_version;
        } catch(err) {
            console.log(err);
        }

        console.log('Fetching api info ... finished!!!');
    }

    async loadConfig() {
        console.log('Fetching config ...');
        this.config = (await axios.get('/config')).data;
        console.log('Fetching config ... finished!!!');
    }

    async loadContest() {
        console.log('Fetching contest ...');
        this.contest = (await axios.get('/contests/' + this.cid)).data;
        console.log('Fetching contest ... finished!!!');
    }

    async loadTeams() {
        console.log('Fetching teams ...');

        const teams = (await axios.get('/contests/' + this.cid + '/teams', {params: {public: true}})).data;
        this.teams = teams.map(team => {
            const id = parseInt(team.id, 10);
            const name = team.name;
            const group = team.affiliation;

            return {"id": id, "name": name, "group": group};
        });

        console.log('Fetching teams ... finished!!!');
    }

    async loadProblems() {
        console.log('Fetching problems ...');

        const problems = (await axios.get('/contests/' + this.cid + '/problems')).data;
        this.problems = problems.map(problem => {
            const id = parseInt(problem.id, 10);
            const name = problem.short_name;
            const color = problem.color;
            const title = problem.name;

            return {"id": id, "name": name, "color": color, "title": title};
        });

        console.log('Fetching problems ... finished');
    }

    async loadSubmissions() {
        console.log('Fetching submissions ...');

        let submissions = (await axios.get('/contests/' + this.cid + '/submissions')).data;
        submissions = submissions.map(submission => {
            const id = parseInt(submission.id, 10);
            const team = parseInt(submission.team_id, 10);
            const problem = parseInt(submission.problem_id, 10);

            let submission_time_str = submission.contest_time.split(":");

            if(submission_time_str[0][0] === '-') {
                return null;
            }
            else {
                const submission_time = parseInt(submission_time_str[0], 10) * 60 + parseInt(submission_time_str[1], 10);
                return {"id": id, "team": team, "problem": problem, "result": null, "submissionTime": submission_time};
            }
        });

        submissions = submissions.filter((submission) => {
            return (submission !== null);
        });

        let judgements = (await axios.get('/contests/' + this.cid + '/judgements')).data;
        judgements = judgements.map(judgement => {
            const submission_id = judgement.submission_id;
            const valid = judgement.valid;
            const result = judgement.judgement_type_id;

            return {"submission_id": submission_id, "valid": valid, "result": result};
        });

        const transform = {};
        for(const judgement of judgements) {
            if(judgement['valid'] === true) {
                transform[judgement['submission_id']] = judgement;
            }
        }

        for(const submission of submissions) {
            if(transform[submission['id']] === undefined) {
                submission['result'] = "";
            }
            else {
                switch(transform[submission['id']]['result']) {
                    case "AC":
                        submission['result'] = "Yes";
                        break;

                    case "NO":
                        submission['result'] = "No - Other";
                        break;

                    case "PE":
                        submission['result'] = "No - Wrong Answer";
                        break;

                    case "WA":
                        submission['result'] = "No - Wrong Answer";
                        break;

                    case "TLE":
                        submission['result'] = "No - Time Limit Exceeded";
                        break;

                    case "RTE":
                        submission['result'] = "No - Run-time Error";
                        break;

                    case "OLE":
                        submission['result'] = "No - Output Limit Exceeded";
                        break;

                    case "MLE":
                        submission['result'] = "No - Run-time Error";
                        break;

                    case "CE":
                        submission['result'] = "No - Compilation Error";
                        break;

                    default:
                        submission['result'] = transform[submission['id']]['result'];
                        break;
                }
            }
        }

        // Ignore compile error submissions
        if (!this.config['compile_penalty'])
            submissions = submissions.filter(submission => submission['result'] !== 'No - Compilation Error');

        this.submissions = submissions;
        console.log('Fetching submissions ... finished!!!');
    }

    async writeContest() {
        console.log('Writing into contest.json ...');

        const teams = this.teams.map(e => ({
            id: e.id,
            name: e.name,
            group: e.group,
        }));

        const problems = this.problems.map((e) => ({
            id: e.id,
            title: e.title,
            name: e.name,
            color: e.color || '',
        }));

        const contest = {
            title: this.contest.name,
            systemName: 'DOMjudge',
            systemVersion: this.domjudgeVersion || '',
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
        console.log('Writing into runs.json ...');

        const data = {
            time: {
                contestTime: this.elapsed_time_in_sec,
                noMoreUpdate: this.frozen,
                timestamp: 0,
            },
            runs: this.submissions,
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
            this.loadApiMain(),
            this.loadConfig(),
            this.loadContest(),
            this.loadTeams(),
            this.loadProblems(),
            this.loadSubmissions(),
        ]);

        console.log('======================\n');

        const { contest } = this;

        const start_time = new Date(contest.start_time);
        const end_time = new Date(contest.end_time);

        this.elapsed_time_in_sec = (() => {
            const current_time = new Date();

            let result;
            if(current_time > end_time) {
                result = end_time - start_time;
            }
            else {
                result = current_time - start_time;
            }

            return parseInt(Math.floor(result / 1000).toString());
        })();

        const duration_in_min = (() => {
            const duration_str = this.contest.duration.split(":");
            const hour = parseInt(duration_str[0]);
            const min = parseInt(duration_str[1]);

            return hour * 60 + min;
        })();

        const [is_freeze_time_passed, freeze_start_time_in_min] = (() => {
            if(this.contest.scoreboard_freeze_duration === null) {
                return false;
            }

            const scoreboard_freeze_duration_str = this.contest.scoreboard_freeze_duration.split(":");
            const hour = parseInt(scoreboard_freeze_duration_str[0]);
            const min = parseInt(scoreboard_freeze_duration_str[1]);

            const freeze_start_time_in_min = duration_in_min - (hour * 60 + min);
            const elapsed_time_in_min = parseInt(Math.floor(this.elapsed_time_in_sec / 60).toString());

            return [elapsed_time_in_min >= freeze_start_time_in_min, freeze_start_time_in_min];
        })();

        this.frozen = (() => {
            if(config.unfreeze === true) {
                return false;
            }
            else {
                return is_freeze_time_passed;
            }
        })();

        // Remove outcome of submission which submitted after freeze.
        this.submissions = this.submissions.map(e => {
            const x = {...e};
            if (this.frozen && e.submissionTime >= freeze_start_time_in_min) {
                x.result = ''
            }

            return x;
        });

        // No pending submission after frozen
        if (!this.config['show_pending'] && !config.unfreeze){
            this.submissions = this.submissions.filter(e => !(this.frozen && e.submissionTime >= freeze_start_time_in_min));
        }

        // Delete submission which is not associated with visible team.
        const visible_teams = new Set();
        for(const team of this.teams) { visible_teams.add(team.id); }
        this.submissions = this.submissions.filter(e => visible_teams.has(e.team));

        await Promise.all([
            this.writeContest(),
            this.writeRuns(),
        ]);

        console.log('======================\n');
    }
}

const converter = new DOMjudgeConverter();

const run = () => {
    converter.do()
        .then(() => {
            if (config.interval) {setTimeout(run, config.interval); }
        })
        .catch(err => {
            if (err.toString) { console.error(err.toString()); }
            else { console.error(err); }
        });
};

run();
