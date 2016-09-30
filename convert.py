'''
Convert Domjudge API to spotboard JSONs.
'''

import requests
from pprint import pprint
import time
import json

class DomjudgeConverter:

    def __init__(self, DOMJUDGE_API_BASE, cid,
                 login_id, login_password):

        self.DOMJUDGE_API_BASE = DOMJUDGE_API_BASE
        assert self.DOMJUDGE_API_BASE.endswith('/'), \
            'DOMJUDGE_API_BASE must ends with "/", check it again.'

        self.cid = cid
        assert isinstance(self.cid, int)

        self.session = requests.Session()
        self._login(login_id, login_password)

        # fetch teams and problems API from domjudge, and build internal db
        self._contest = self._fetch_contest()
        self._teams = self._fetch_teams()
        self._problems, self._problems_map = self._fetch_problems()
        self._submissions = self._fetch_submissions()
        self._judgings = self._fetch_judgings()

    def _login(self, id, password):
        print 'Logging on using id %s ...' % id
        r = self.session.post(self.DOMJUDGE_API_BASE + '../public/login.php',
                              data={'cmd': 'login',
                                    'login': id,
                                    'passwd': password})
        if not r.ok:
            raise Exception("Login failed")
        print 'Login successful!'
        r.close()

    def _fetch_contest(self):
        print 'Fetching /problems ...'
        r = self.session.get(self.DOMJUDGE_API_BASE + 'contests')
        contests = r.json()
        r.close()
        assert not 'error' in contests
        return contests[str(self.cid)]


    def _fetch_teams(self):
        print 'Fetching /teams ...'
        r = self.session.get(self.DOMJUDGE_API_BASE + 'teams')
        teams = r.json()
        r.close()
        return teams

    def _fetch_problems(self):
        print 'Fetching /problems ...'
        r = self.session.get(self.DOMJUDGE_API_BASE + 'problems?cid=' + str(self.cid))
        problems = r.json()
        r.close()
        assert len(problems) > 0, 'Contest is empty. possibly not logged in?'

        # a map to (domjudge problem id) -> (0-based id)
        problems_map = dict()
        for id, e in enumerate(problems):
            problems_map[e['id']] = id

        print '  Total %d problems' % len(problems)
        return problems, problems_map

    def _fetch_submissions(self):
        print 'Fetching /submissions ...'
        r = self.session.get(self.DOMJUDGE_API_BASE + 'submissions?cid=' + str(self.cid))
        submissions = r.json()  # id, team, problem, language, time
        r.close()
        print '  Total %d submissions' % len(submissions)
        return submissions

    def _fetch_judgings(self):
        print 'Fetching /judgings ...'
        r = self.session.get(self.DOMJUDGE_API_BASE + 'judgings?cid=' + str(self.cid))
        judgings = r.json()  # id, submission, outcome
        r.close()
        print '  Total %d judgings' % len(judgings)
        return judgings


    #############################################################################

    def get_teams(self):
        def _to_name(e):
            if not e['affiliation']:
                return e['name']
            else:
                return u"%s (%s)" % (e['name'], e['affiliation'])

        return [{'id': e['id'], 'name' : _to_name(e)} \
                for e in self._teams]

    def get_problems(self):
        # assign an incresasing id
        problems_json = []
        for id, e in enumerate(self._problems):
            problems_json.append({
                'id': self._problems_map[e['id']],
                'title': e['name'],
                'name': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[id],
            })
        return problems_json

    def get_contest_json(self):
        return {
            u'title': self._contest['name'],
            u'systemName': 'DOMJudge',
            u'systemVersion': '',
            u'problems': self.get_problems(),
            u'teams': self.get_teams()
        }

    def get_runs_json(self):
        o = {}
        o['time'] = {
            'contestTime' : max(0, int(time.time()) - self._contest['start']), #18000,
            'noMoreUpdate' : False,
            'timestamp' : 0,
        }
        o['runs'] = []

        _judging_map = {}
        for j in self._judgings:
            _judging_map[j['submission']] = j

        for run_idx, e in enumerate(self._submissions):
            #e: id, team, problem, language, time
            def _to_result(outcome):
                if not outcome: return ''
                return {
                    'correct': 'Yes',
                    'wrong-answer': 'No - Wrong Answer',
                    'timelimit': 'No - Time Limit Exceeded',
                    'run-error': 'No - Run-time Error',
                    'compiler-error': 'No - Compilation Error',
                    'no-output': 'No - Other',
                    'judging': '',
                }[outcome]

            j = _judging_map.get(e['id'])
            if j is None: # not yet judged
                j = {'outcome' : ''}

            r = {
                'id' : (run_idx + 1),
                'problem' : self._problems_map[e['problem']],
                'team' : e['team'],
                'result' : _to_result(j['outcome']),
                'submissionTime' : int((e['time'] - self._contest['start']) / 60) # in minutes
            }

            if r['result'] == 'No - Compilation Error': continue
            o['runs'].append(r)

        return o


def main():
    #DOMJUDGE_API_BASE = 'https://www.domjudge.org/demoweb/api/'
    #DOMJUDGE_LOGIN = ('admin', 'admin')

    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api_base', required=True,
                        help='API base path (e.g. https://www.domjudge.org/demoweb/api/)')
    parser.add_argument('--cid', required=True, type=int,
                        help='The contest id from DOMJudge (e.g. 2)')
    parser.add_argument('--login_id', required=True,
                        help='user id to login scoreboard (e.g. admin)')
    parser.add_argument('--login_pw', required=True,
                        help='password to login')
    args = parser.parse_args()

    DOMJUDGE_API_BASE = args.api_base
    DOMJUDGE_LOGIN = args.login_id, args.login_pw

    c = DomjudgeConverter(DOMJUDGE_API_BASE,
                          cid=args.cid,
                          login_id=DOMJUDGE_LOGIN[0],
                          login_password=DOMJUDGE_LOGIN[1],
                          )
    #pprint(c.get_contest_json())
    #pprint(c.get_runs_json())

    with open('contest.json', 'w') as f:
        j = json.dumps(c.get_contest_json(), sort_keys=True, indent=4, separators=(',', ': '))
        print 'Written into contest.json'
        f.write(j)

    with open('runs.json', 'w') as f:
        j = json.dumps(c.get_runs_json(), sort_keys=True, indent=4, separators=(',', ': '))
        print 'Written into runs.json'
        f.write(j)



if __name__ == '__main__':
    main()
