

function updateSchema (db) {
    db.prepare('create table if not exists merkleproofs (txhash blob, blockhash blob, merkleroot blob, branches blob)').run();
}

function MerkleProofDb (db) {

    const psAddMerkleProof = db.prepare('insert into merkleproofs (txhash,blockhash,merkleroot,branches) values (?,?,?,?)');
    
    function addMerkleProof (txhash, blockhash, merkleroot, branches) {
        return psAddMerkleProof.run(txhash, blockhash, merkleroot, branches);
    }

    return {
        ps: { psAddMerkleProof },
        addMerkleProof
    }
}
