module.exports = {
    domjudge: {
        // DOMjudge api base URL
        api: 'http://localhost/domjudge/api/',

        // DOMjudge user information (needs jury permission)
        username: 'username',
        password: 'password',

        // DOMjudge version to display
        version: '5.3.0',
    },
    filter: {
        // Target contest cid
        cid: 1,
        // Target team categories sortorder
        sortorder: 0,
    },

    // Directory to make json files
    dest: '.',
    // Force scoreboard unfreeze (for awarding)
    unfreeze: false,

    /**
     * Running interval in milliseconds.
     * null for running only once
     *
     * e.g. null
     * e.g. 3000
     */
    interval: 3000,

    axios: {
        // API request timeout
        timeout: 3000,
    },
};
