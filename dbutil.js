
const sqlite3 = require('better-sqlite3');

function OpenSqliteFile (filename) {
    let db = new sqlite3(filename);
    db.pragma('journal_mode = WAL');
    process.on('exit', function () { db.close(); });
    return db;
}

function Transactor (db) {
    return function transaction (fn) {
        return db.transaction(fn)();
    }
}

module.exports = {
    Transactor,
    OpenSqliteFile
}