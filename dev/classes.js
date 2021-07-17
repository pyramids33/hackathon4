


class Wallet {

    static x = [ 1, 2, 3 ];

    constructor (db) {
        this.db = db;
    }

    dothing () {
        console.log('thing1')
    }

}

class Wallet2 {

    static x = [...Wallet.x, 5, 6, 7];

    static updateSchema (db) {
        console.log(this, this.x)
        Wallet.updateSchema(db);
        console.log('thing3')
    }

    constructor (db) {
        this.db = db;
    }

    dothing () {
        console.log('thing4')
    }

}

console.log(Wallet2.x)


let W2 = new Wallet2(null);
W2.dothing();
