"use strict";
const request   = require ('request');
const config    = require ('./config.json');
const knowaddr  = require ('./knowaddr.json');
const fs        = require ('fs');


let cascadingInspect = (addresses, level, chain) => {
    //console.error ('cascading', level);
    return new Promise ((resolve, reject) => {
        if (level >= config.levels) {
            resolve ([]);
        }

        var promises = [];

        for (let i = 0; i < addresses.length; i++) {
            promises.push (new Promise ((resolve, reject) => {
                var node = config.nodes [Math.floor (Math.random () * config.nodes.length)];
                //console.error ('call',level);
                request('http://' + node + '/api/transactions?senderId=' + addresses[i], function (err, response, body){
                    if (err || response.statusCode != 200) {
                        return resolve ([]); 
                    }

                    var data = JSON.parse(body);

                    var res = [];
                    var naddr = [];

                    if (data.transactions == null)
                        data.transactions = [];
                    console.error (data.transactions.length);

                    for (let i = 0; i < data.transactions.length; i++) {
                        if (data.transactions[i].height <= 1451520) continue;

                        if (data.transactions[i].recipientId in knowaddr) {
                            let nchain = chain.slice ();
                            nchain.push (data.transactions[i].recipientId);

                            res.push ({
                                txid: data.transactions[i].id,
                                recipient: data.transactions[i].recipientId,
                                recipientname: knowaddr[data.transactions[i].recipientId],
                                amount: data.transactions[i].amount / 100000000,
                                chain: nchain,
                                level: level
                            });
                            //console.error (data.transactions[i]);
                        } else {
                            naddr.push (data.transactions[i].recipientId);
                        }
                    }

                    var cchain = chain.slice ();
                    cchain.push (addresses[i]);

                    if (level + 1 >= config.levels || naddr.length == 0) 
                        return resolve (res);

                    cascadingInspect (naddr, level+1, cchain).then (txs => {
                        resolve (res.concat (txs));
                    }).catch (() => {
                        resolve (res);
                    });
                });
            }));   
        }

        Promise.all (promises).then (data => {
            var total = [];

            for (let j = 0; j < data.length; j++)
                total = total.concat (data[j]);

            resolve (total);
        }).catch (() => {
            resolve ([]);
        });
    });
}


let analyzeAddress = (delegate) => {
    return new Promise ((resolve, reject) => {
        console.error ('start for ', delegate.username);
        cascadingInspect ([delegate.address], 0, []).then (txs => {

            var node = config.nodes [Math.floor (Math.random () * config.nodes.length)];

            request ('http://' + node + '/api/delegates/forging/getForgedByAccount?generatorPublicKey=' + delegate.publicKey, function (error, response, body) {
                var forged = 0;
                if (!error && response.statusCode == 200) {
					var data = JSON.parse(body);
					forged = data.forged / 100000000;
                }

                var dumped = 0;

                for (var z = 0; z < txs.length; z++)
                    dumped += txs[z].amount;

                var obb = {
                    delegate: delegate.username, 
                    address: delegate.address,
                    forged: forged,
                    dumped: dumped,
                    percentage: dumped / forged * 100,
                    txs: txs
                };
                console.error ('end for ', delegate.username);
                
                if (txs.length > 0)  {
                    console.error (obb);
                    fs.writeFile ('result/'+delegate.username+'.json', JSON.stringify (obb), function (err, data) {
                    });
                    resolve (obb);
                }

                else reject ();

            });
        }).catch (() => {
            resolve ({
                delegate: delegate.username, 
                address: delegate.address,
                error: true
            });
        });
    });
};

// Get the delegate list
var node = config.nodes [Math.floor (Math.random () * config.nodes.length)];
request('http://' + node + '/api/delegates/?limit=101&offset=0&orderBy=rate:asc', function (err, response, body){
	if (err || response.statusCode != 200) {
        console.error ('nodata',node);
		return;
    }

	var data = JSON.parse(body);
    var promises = [];

    for (let i = parseInt (process.argv[2] || 0); i < parseInt (process.argv[3] || data.delegates.length); i++)
        promises.push (analyzeAddress (data.delegates[i]));


    Promise.all (promises).then ((data) => {
        console.error ('End');
        console.log (JSON.stringify (data));
        //fs.writeFile ('result.json', JSON.stringify (data), function (err, data) {
            //console.log (err);
        //});
    }).catch (() => {
        console.error ('End catch');
    });
});



