const bsv = require('bsv');
const EventEmitter = require('events').EventEmitter;


function Inbox (options) {

    let emitter = new EventEmitter();
    let message;
    let messages = [];
    let tempbw = new bsv.Bw();
    
    let netMagicHex = options.netMagicHex;

    function update (data) {

        if (data) {
            tempbw.write(data);
        }
        
        if (message === undefined) {
            if (tempbw.getLength() >= 24) {
                
                let buf = tempbw.toBuffer();
                tempbw = new bsv.Bw();

                // find the magic (start of message header)
                let magicPos = undefined;
                
                for (var i = 0; i < buf.length - 4; i++) {    
                    if (netMagicHex === buf.slice(i, 4).toString('hex')) {
                        magicPos = i;
                    }
                }

                if (magicPos === undefined) {
                    tempbw.write(buf.slice(buf.length-3));
                    return;
                } 
                
                if (magicPos > 0) {
                    buf = buf.slice(magicPos);
                }

                let br = new bsv.Br(buf);

                message = {
                    magic: br.readUInt32LE(),
                    command: br.read(12),
                    payloadLength: br.readUInt32LE(),
                    checksum:  br.read(4).toString('hex'),
                    payload: new bsv.Bw()
                };

                // cut off trailing zero bytes, convert to string
                message.command = message.command.slice(0,Math.max(message.command.indexOf(0),0)||undefined).toString();
                
                if (buf.length > 24) {
                    // got header, put rest of buf back into temp to continue reading
                    // buf should contain at least some payload, might have additional messages
                    tempbw.write(buf.slice(24));
                }
            }
        } 

        if (message !== undefined) {
            // after eventually finding the start of a message above

            let remaining = message.payloadLength - message.payload.getLength();
            
            if (tempbw.getLength() >= remaining) {
                
                let buf = tempbw.toBuffer();
                tempbw = new bsv.Bw();

                message.payload.write(buf.slice(0, remaining));
                message.payload = message.payload.toBuffer();

                let checksum = bsv.Hash.sha256Sha256(message.payload).slice(0, 4);
                
                if (checksum.toString('hex') === message.checksum.toString('hex')) {
                    messages.push(message);
                    emitter.emit('message', message);
                    // message is discarded if check failed.
                }

                message = undefined;

                tempbw.write(buf.slice(remaining));
                
                update();
            }
        }
    }

    function next () {
        if (messages.length > 0) {
            return messages.shift();
        }
        return undefined;
    }

    return Object.freeze({
        emitter,
        next,
        update
    })
}

module.exports = Inbox;