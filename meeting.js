var express = require('express');
var app = express();
var fs      = require("fs");   
//var http = require('http');
// Start Express https server on port 8443
//var webServer = http.createServer(app);
var https = require('https');
var fs = require('fs');

var options = {
  cert: fs.readFileSync('/etc/letsencrypt/live/sync-jam-webrtc-external.youseeu.com/fullchain.pem'),
  key: fs.readFileSync('/etc/letsencrypt/live/sync-jam-webrtc-external.youseeu.com/privkey.pem')
};

var webServer = https.createServer(options,app);
/*
process.on('uncaughtException', function (err) {
  
})
*/
app.get('/', function(req, res){
  res.send('Socket Io Running');
});

var io = require('socket.io').listen(webServer);
io.set('log level', 1); // reduce logging
webServer.listen(8080);


var roomdictionary = {};
var browserdictionary = {};
var count_dict = {};

//create new object
// This callback function is called every time a socket
// tries to connect to the server
io.sockets.on('connection', function(socket) {
	//When a room create is invoked
	socket.on('room', function(roomName) {
		    var count = 0;
            if(count_dict.hasOwnProperty(roomName)){
               count = count_dict[roomName];
            }
            count ++;
            count_dict[roomName] = count;
            console.log('-----'+count);
			if (roomdictionary[roomName] == null) {//if room is empty
				roomdictionary[roomName] = roomName;
				socket.room = roomName;
				socket.join(roomName);
				socket.emit('onRoomCreateSuccessful', roomdictionary[roomName],socket.id);
				//console.log("Created the room --> "+roomName);
				//console.log("Total clients on the room  "+roomName+" is --> " + io.sockets.clients(roomName).length);
			} else {
				
				//console.log("Entering to the room "+roomName);
				if (count != 3) {
						socket.room = roomName;
						socket.join(roomName);
						//joining to a room
						socket.emit('onRoomJoined', roomdictionary[roomName]);
						//console.log("Total clients on the room  "+roomName+" is --> " + io.sockets.clients(roomName).length);
				}else{
					
					
					//console.log("Reject User");
					//add room fill code
				}
			}
	});
	// When a user send a SDP message
	// broadcast to all users in the room
	socket.on('message', function(message) {
		//console.log((new Date()) + ' Received Message, broadcasting: ' + message);
		//io.sockets.in(socket.room).emit('message', message);
		socket.broadcast.to(socket.room).emit('message', message);
		// socket.emit('log', "Sendin On Room-->"+socket.room);

	});

	// When the user hangs up
	// broadcast bye signal to all users in the room
	socket.on('disconnect', function() {
		// close user connection
		
		socket.broadcast.to(socket.room).emit('partnerDisconnet', socket.room);
		socket.leave(socket.room);
		    var count = 0;
            if(count_dict.hasOwnProperty(socket.room)){
               count = count_dict[socket.room];
            }
            count --;
            console.log('-----disconnect : '+count);
            count_dict[socket.room] = count;
		//console.log("Clients remaining on room "+socket.room+" is" + io.sockets.clients(socket.room).length);
		if (count ==0){
			//console.log("Deleting room --> "+ socket.room);
			delete roomdictionary[socket.room];
		}
		
	});

});
