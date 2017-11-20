module.exports = {
    domjudge: {
        /**
         * DOMjudge api base URL
         */
        api: 'http://localhost/domjudge/api/',

        /**
         * DOMjudge uesr information
         * Required role: jury
         */
        username: 'username',
        password: 'password',
    },
    filter: {
        /**
         * Contest cid which has to be viewed in Spotboard
         */
        cid: 1,

        /**
         * DOMjudge team category's sortorder to be viewed.
         * For participiants, its default value is 0.
         */
        sortorder: 0,
    },

    /**
     * Destination path which files will be created.
     *
     * e.g. '.'
     * e.g. '/var/www/html/spotboard/'
     */
    dest: '.',

    /**
     * Force unfreezing scoreboard client side.
     * This might be useful when collecting final runs.json privately.
     */
    unfreeze: false,

    /**
     * Running interval in milliseconds.
     * null for running only once.
     *
     * e.g. null
     * e.g. 3000
     */
    interval: 3000,

    axios: {
        /**
         * API request timeout
         */
        timeout: 3000,
    },
};
