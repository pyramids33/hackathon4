const bsv = require('bsv');

const { Transactor } = require('./dbutil.js');

const DEFAULT_KEY_NAME = 'default';

function updateSchema (db) {
    db.prepare('create table if not exists hdkeys (name text primary key, xprv blob, derivationpath text, counter int)').run();
    db.prepare('create unique index if not exists hdkeys_xprv_derivationpath on hdkeys(xprv,derivationpath)').run();
}

function HDKeysDb (db) {

    const transaction = Transactor(db);
    
    const psHDKeyByName = db.prepare('select * from hdkeys where name = ?');
    
    function getHDKey (name) {
        if (name === undefined) {
            return psHDKeyByName.get(DEFAULT_KEY_NAME);
        } else {
            return psHDKeyByName.get(name);
        }   
    }

    const psAllHDKeys = db.prepare('select * from hdkeys order by name');
    
    function allHDKeys () {
        return psAllHDKeys.all();
    }
    
    const psAddHDKey = db.prepare('insert into hdkeys (name,xprv,derivationpath,counter) values (?,?,?,?);');

    function addHDKey (name, xprv, derivationpath, counter) {
        return psAddHDKey.run(name, xprv, derivationpath, counter === undefined ? 0 : counter);
    }

    const psNextIndex = db.prepare('update hdkeys set counter = counter + 1 where name = ?;');

    function nextIndex (name) {
        name = name || DEFAULT_KEY_NAME;
        return transaction(function () {
            psNextIndex.run(name);
            return psHDKeyByName.get(name);
        });
    }

    return {
        ps: { psHDKeyByName, psAddHDKey, psNextIndex },
        getHDKey,
        addHDKey,
        nextIndex,
        allHDKeys
    }
}

function initData (db, network) {
    HDKeysDb(db).addHDKey('default', network.Bip32.fromRandom().toBuffer());
}

module.exports = {
    updateSchema,
    initData,
    api: HDKeysDb
}