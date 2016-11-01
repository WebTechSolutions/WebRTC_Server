var UserRegistry        = require('./user-registry.js');
var UserSession         = require('./user-session.js');
var express             = require('express');
var path                = require('path');
var url                 = require('url');
var http                = require('http');
var fsPath              = require('fs-path');
var kurento             = require('kurento-client');
var fs                  = require('fs');
var bodyParser          = require('body-parser');
var session_time_map    = {};
var userRegistry        = new UserRegistry();
var rooms               = {};
var streamDict          = {};
/**
 * configuration variables read from CONFIG.json
 */
var config_data,config_obj,websocket_url,kurento_url,json_path,admin_user_name,admin_password;
var cert_path,key_path,record_path,max_rec_band,min_rec_band,max_snd_band,min_snd_band;
var record_format,room_expire;
setConfig();
var settings            = {
                             KURENTOURL: kurento_url
                          };
var app                 = express();
var options             = {
                            key:  fs.readFileSync(key_path),
                            cert: fs.readFileSync(cert_path)
                         };

var https               = require('https');
var httpsServer         = https.createServer(options, app).listen(httpsPort);
var io                  = require('socket.io')(httpsServer);

process.on('uncaughtException', function (err) {
 // console.log('Caught exception: ' + err);
 // console.log(err.stack);
});
/**
 * Message handlers
 */
io.on('connection', function (socket) {
    setConfig();
    var userList = '';
    for (var userId in userRegistry.usersById) {
        userList += ' ' + userId + ',';
    }
    socket.emit('id', socket.id);
    socket.on('error', function (data) {
        leaveRoom(socket.id, function () {

        });
    });

    socket.on('disconnect', function (data) {
        leaveRoom(socket.id, function () {
            
        });
    });

    socket.on('message', function (message) {
        switch (message.id) {
            case 'register':

                var room              = message.room;
                /*var usercount         = 0;
                if(rooms.hasOwnProperty(room)){
                    var roomObj           = rooms[room]; 
                    if(roomObj){
                            var usersInRoom       = roomObj.participants;
                            for (var i in usersInRoom) {
                                usercount++;
                            }
                    }
                }
                var recordtime        = session_time_map[room];
                var timestampnow      = Date.now();
                var recordingtime     = (timestampnow - recordtime)/1000;
                var recordingtime     = Math.round(recordingtime);
                var msg  = {
                  id  : 'room_expired',
                  time: recordingtime
                };
                var expiretime = room_expire * 60 * 60;
                console.log('userCount:'+usercount+' totaltime: '+recordingtime+' expiretime: '+expiretime);
                if(recordingtime > expiretime && usercount<1){
                    //socket.emit('message', msg);
                    //return;
                }*/
                var oldsocket   = socket.id;
                if(message.role == 'screen')
                {
                    socket.id   = socket.id+'_screen';
                    register(socket, message.userName,message.role,message.mode,message.webinar, function(){

                    });
                }
                else
                {
                    register(socket, message.userName,message.role,message.mode,message.webinar, function(){

                    });
                }
                socket.id     = oldsocket; 
                console.log('reg');
                return;
            break;
            case 'joinRoom':
                var oldsocket   = socket.id;
                if(message.role == 'screen')
                {
                    socket.id   = socket.id+'_screen';
                    joinRoom(socket,message.userName,message.role,message.mode, message.roomName,message.webinar,message.recording, function () {
                       
                    });
                }
                else
                {
                    joinRoom(socket,message.userName,message.role,message.mode, message.roomName,message.webinar,message.recording, function () {
                         
                    });
                }
                socket.id = oldsocket;
                break;
            case 'receiveVideoFrom':
                var oldsocket = socket.id;
                if(message.role == 'screen')
                {
                    socket.id = socket.id+'_screen';
                     receiveVideoFrom(socket, message.sender, message.sdpOffer, function () {

                     });
                }
                else
                {
                     receiveVideoFrom(socket, message.sender, message.sdpOffer, function () {

                     });
                }
                socket.id = oldsocket; 
               
                break;
            case 'leaveRoom':
                leaveRoom(socket.id);
                break;
            case 'leaveMyPublishOnly':
                leaveMyPublishOnly(socket.id);
                break;
            case 'call':
                call(socket.id, message.to, message.from);
                break;
            case "startRecording":
                startRecording(socket.id,message.room);
                break;
            case "stopRecording":
                stopRecord(message.sessionid,false);
                break;
            case 'onIceCandidate':
                var oldsocket = socket.id;
                if(message.role == 'screen')
                {
                    socket.id = socket.id+'_screen';
                    addIceCandidate(socket, message);
                }
                else
                {
                    addIceCandidate(socket, message);
                }
                socket.id = oldsocket; 
                break;
             case 'sendToAll':
                sendToAll(socket,message);
                break;
             case 'asignRole':
                 asignRole(socket,message);
                 break;
             case 'sendToOne':
                sendToOne(socket,message);
                break;  
            case 'getTime':
                /*var roomName    = message.room;
                var out         = {}
                out['time']     = '0';
                if(session_time_map.hasOwnProperty(roomName)){
                        var recordtime = session_time_map[roomName];
                var timestampnow      = Date.now();
                var recordingtime     = (timestampnow - recordtime)/1000;
                var recordingtime     = Math.round(recordingtime);
                        out['time']  =  recordingtime;
                }
                out.id   = "onGetTime";
                socket.emit('message', out);
                var jsonData = '{"currentTime":"'+recordingtime+'"}';
                /*fsPath.writeFile(json_path+roomName+'/time.json', jsonData, function(err){
                    
                  });*/
                break;
            default:
                socket.emit({id: 'error', message: 'Invalid message ' + message});
        }
    });
});
function asignRole(socket,message){
    message.id   = "onReceiveRollchange";
    var socketid = message.receiversocket;
    var sendersocketid = message.sendersocket;
    var user     = userRegistry.getById(socketid);
    if(message.assignedrole){ user.role = message.assignedrole; }
    if(message.assignedmode){ user.mode = message.assignedmode; }
    var sender = userRegistry.getById(sendersocketid);
    if(message.senderrole){ sender.role = message.senderrole; }
    if(message.sendermode){ sender.mode = message.sendermode; }
    socket.broadcast.emit('message', message);
    
}  
function sendToAll(socket,message){

    message.id = "onReceiveSendToAll";
    var contentObj = JSON.parse(message.contentJson);
    /*
    if(contentObj.method == 'participant_cam_on_off'){
        var room_name  = message.room;
        var recordtime = session_time_map[room_name];
        var timestampnow      = Date.now();
        var recordingtime     = (timestampnow - recordtime)/1000;
        var recordingtime     = Math.round(recordingtime);
        var obj       = {};
        obj['id']     = socket.id;
        obj['action'] = 'camoffone';
        obj['status'] = contentObj.status;
        var resultJson = JSON.stringify(obj);
        fsPath.writeFile(json_path+room_name+'/'+recordingtime+'.json', resultJson, function(err){
            
        });
        
    }
    if(contentObj.method == 'participant_mic_on_off'){
        var room_name = message.room;
        var recordtime = session_time_map[room_name];
        var timestampnow      = Date.now();
        var recordingtime     = (timestampnow - recordtime)/1000;
        var recordingtime     = Math.round(recordingtime);
        var obj       = {};
        obj['id']     = socket.id;
        obj['action'] = 'micoffone';
        obj['status'] = contentObj.status;
        var resultJson = JSON.stringify(obj);
        fsPath.writeFile(json_path+room_name+'/'+recordingtime+'.json', resultJson, function(err){
            
        });

    }*/
    socket.broadcast.emit('message', message);
}  
function sendToOne(sct,message){
    message.id   = "onReceiveSendToOne";
    var socketid = message.receiversocket;
    var user = userRegistry.getById(socketid);
    user.socket.emit('message', message);
}
/**
 * Register user to server
 * @param socket
 * @param name
 * @param callback
 */
function register(socket, userName,role,mode,webinar,callback){
    var userSession = new UserSession(socket.id, socket,userName,role,mode,webinar);
    userSession.name = userName;
    userRegistry.register(userSession);
    userSession.sendMessage({
        id: 'registered',
        data: 'Successfully registered ' + userSession.userName+"//"+userSession.role+"//"+userSession.mode,
        role: userSession.role
    });
    
}

/**
 * Gets and joins room
 * @param socket
 * @param roomName
 * @param callback
 */
function joinRoom(socket,userName,role,mode,roomName,webinar,record, callback) {
    /*
    if(!session_time_map.hasOwnProperty(roomName)){
        
          var timestamp                          = Date.now();
          session_time_map[roomName]             = timestamp; 
          var message  = {
                id  : 'onInitialTime',
                time: '0'
            };
            socket.emit('message', message);        
    }else{
        var recordtime        = session_time_map[roomName];
        var timestampnow      = Date.now();
        var recordingtime     = (timestampnow - recordtime)/1000;
        var recordingtime     = Math.round(recordingtime);
        var message  = {
                id  : 'onInitialTime',
                time: recordingtime
            };
            socket.emit('message', message);
    }*/
    getRoom(roomName, function (error, room) {
        if (error) {
            callback(error)
        }
        /*
        var usersInRoom   = room.participants;
        var usercount     = 0;
        if(usercount>14 && webinar=='0')
        {
            var message  = {
                id: 'countExceed',
                count: usercount
            };
            socket.emit('message', message);
        }
        else
        {*/
            join(socket,userName,role,mode, room,record, function (error, user) {               
                
            });
            
        //}
        
        
    });
}
//setTimeout(pingUser,30000);
function pingUser(){
    var allUsers = userRegistry.usersById;
    /*
        id: 'ngTGcZTVAQK1Rfd7AAAA',
        userName: 'user',
        role: 'org',
        mode: 'presenter',
        socket: socketobject
        name: 'user',
        roomName: '100'
    */
    if(allUsers){
            var existingUserIds = [];
            for (var i in allUsers) {
              if(allUsers[i].webinar == '0'){
                existingUserIds.push(allUsers[i].id+'*_*'+allUsers[i].roomName);
              }
            }
            for(var key in allUsers){

               var user = allUsers[key];
               if(allUsers[i].webinar == '0'){
                       var userSocket = user.socket;
                       var data = {
                            id: 'onExistingUserForConnectionCheck',
                            data: existingUserIds
                        };
                       user.socket.emit('message', data);
                       console.log('sendDataTo : '+key);
                }
            }
    }
    setTimeout(pingUser,30000);
}
/**
 * Gets room. Creates room if room does not exist
 * @param roomName
 * @param callback
 */
function getRoom(roomName, callback) {

    var room = rooms[roomName];
    if (room == null) {
        getKurentoClient(function (error, kurentoClient) {
            if (error) {
                return callback(error);
            }
            kurentoClient.create('MediaPipeline', function (error, pipeline) {
                if (error) {
                    return callback(error);
                }

                room = {
                    name: roomName,
                    pipeline: pipeline,
                    participants: {},
                    kurentoClient: kurentoClient
                };
                rooms[roomName] = room;
                callback(null, room);
            });
        });
    } else {
        callback(null, room);
    }
}

/**
 * Join (conference) call room
 * @param socket
 * @param room
 * @param callback
 */
function join(socket,userName,role,mode, room,record, callback) {
    var userSession = userRegistry.getById(socket.id);
    userSession.setRoomName(room.name);
    room.pipeline.create('WebRtcEndpoint', function (error, outgoingMedia) {
        if (error) {
            if (Object.keys(room.participants).length == 0) {
                room.pipeline.release();
            }
            return callback(error);
        }
        outgoingMedia.setMaxVideoRecvBandwidth(max_rec_band);
        outgoingMedia.setMinVideoRecvBandwidth(min_rec_band);
        userSession.outgoingMedia = outgoingMedia;


        /*

        outgoingMedia.on('MediaStateChanged', function(event) {
            console.log("state_change for outgoing Endpoint from "+event.oldState+" to "+event.newState);
            if (event.newState === 'DISCONNECTED') {
                console.log("User disconnected "+userName);
                var datamsg = {
                            id: 'userDisconnected',
                            streamId: socket.id
                        };
                userSession.sendMessage(datamsg);
                socket.broadcast.emit('message', datamsg);
            }else{
                var datamsg = {
                            id: 'playstarted',
                            streamId: socket.id
                        };
                userSession.sendMessage(datamsg);
            }
                        
        });



        */
        // add ice candidate the get sent before endpoint is established
        var iceCandidateQueue = userSession.iceCandidateQueue[socket.id];
        if (iceCandidateQueue) {
            while (iceCandidateQueue.length) {
                var message = iceCandidateQueue.shift();
                userSession.outgoingMedia.addIceCandidate(message.candidate);
            }
        }

        userSession.outgoingMedia.on('OnIceCandidate', function (event) {
            var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
            userSession.sendMessage({
                id: 'iceCandidate',
                sessionId: userSession.id,
                candidate: candidate
            });
        });

        // notify other user that new user is joining
        var usersInRoom = room.participants;
        var data = {
            id: 'newParticipantArrived',
            userName: userName,
            role: role,
            mode: mode,
            new_user_id: userSession.id
        };

        // notify existing user
        for (var i in usersInRoom) {
            if(usersInRoom[i].role != 'screen')
            {

                usersInRoom[i].sendMessage(data);
                
            }
            
        }

        var existingUserIds = [];
        for (var i in room.participants) {
            existingUserIds.push(usersInRoom[i].id+"*_*"+usersInRoom[i].userName+"*_*"+usersInRoom[i].role+"*_*"+usersInRoom[i].mode);
        }
        // send list of current user in the room to current participant
        userSession.sendMessage({
            id: 'existingParticipants',
            data: existingUserIds,
            roomName: room.name,
            role: role
        });

        // register user to room
        room.participants[userSession.id] = userSession;
        //MP4 has working sound in VLC, not in windows media player,
        //default mediaProfile is .webm which does have sound but lacks IE support
        var str    = userSession.id;
        var substr = 'screen';
        var streamName = userSession.id;
        if(streamDict.hasOwnProperty(streamName)){
             var count = streamDict[streamName];
                 count++;
                 streamDict[streamName] = count;
             streamName= streamName+'_'+count;
        }else{
            streamDict[streamName] = 1;
            streamName             = streamName+'_1';
        }
        if(str.indexOf(substr) > -1) {
                var recorderParams = {
                uri: record_path+room.name+'/'+streamName+ record_format,mediaProfile:'WEBM_VIDEO_ONLY'
            };
        }else{
                var recorderParams = {
                uri: record_path+room.name+'/'+streamName+ record_format,mediaProfile:'WEBM_VIDEO_ONLY'
            };
        }
        room.pipeline.create('RecorderEndpoint', recorderParams, function(error, recorderEndpoint){
        userSession.outgoingMedia.recorderEndpoint = recorderEndpoint;
        outgoingMedia.connect(recorderEndpoint);
           
        });
        
        callback(null, userSession);
    });
}
function startRecording(sessionId,room_name){
        console.log('recording started :'+sessionId+' // '+room_name);
        var streamName    =   sessionId;
        if(streamDict.hasOwnProperty(streamName)){
             streamName  = streamName+'_'+streamDict[streamName];
        }
        
        var userSession   = userRegistry.getById(sessionId);
        userSession.outgoingMedia.recorderEndpoint.record();

        /*
        var recordtime = session_time_map[room_name];
        var timestampnow      = Date.now();
        var recordingtime     = (timestampnow - recordtime)/1000;
        var recordingtime     = Math.round(recordingtime);
        //id: name_id, realname: realName, role: userRole, mode: userMode,action:"joined"
        var obj       = {};
        obj['id']     = streamName;
        obj['action'] = 'joined';
        var resultJson = JSON.stringify(obj);
        fsPath.writeFile(json_path+room_name+'/'+recordingtime+'.json', resultJson, function(err){
            
          });
        var data = {
            id: 'recordingStarted'
        };
        userSession.sendMessage(data);   
        */
}
/**
 * Leave my connection only
 * @param sessionId
 * @param callback
 */
function leaveMyPublishOnly(sessionId, callback) {
    var userSession = userRegistry.getById(sessionId);
    stopRecord(userSession.roomName,sessionId);
    if (!userSession) {
        return;
    }
    
    var room = rooms[userSession.roomName];

    if(!room){
        return;
    }
    var usersInRoom = room.participants;
    delete usersInRoom[userSession.id];
    userSession.outgoingMedia.release();
    var data = {
        id: 'participantLeft',
        sessionId: userSession.id
    };
    for (var i in usersInRoom) {
        var user = usersInRoom[i];
        var scrnses = user.id;
        if(scrnses != sessionId)
        {
            user.incomingMedia[userSession.id].release();
            delete user.incomingMedia[userSession.id];       
            user.sendMessage(data);  
        }
        
    }
    // Release pipeline and delete room when room is empty
    if (Object.keys(room.participants).length == 0) {
        room.pipeline.release();
        delete rooms[userSession.roomName];
    }
    delete userSession.roomName;
}
/**
 * Leave (conference) call room
 * @param sessionId
 * @param callback
 */
function leaveRoom(sessionId, callback) {
    var userSession = userRegistry.getById(sessionId);
    if (!userSession) {
        return;
    }
    stopRecord(userSession.roomName,sessionId);
    var room = rooms[userSession.roomName];

    if(!room){
        return;
    }
    var usersInRoom = room.participants;
    delete usersInRoom[userSession.id];
    if(userSession.outgoingMedia){
        userSession.outgoingMedia.release();
    }
    // release incoming media for the leaving user
    for (var i in userSession.incomingMedia) {
        if(userSession.incomingMedia[i]){
            userSession.incomingMedia[i].release();
            delete userSession.incomingMedia[i];
        }
        
    }

    var data = {
        id: 'participantLeft',
        sessionId: userSession.id
    };
    for (var i in usersInRoom) {

        var user = usersInRoom[i];
        // release viewer from this
        if(user.role != 'screen')
        {
            if(user.incomingMedia[userSession.id]){
                user.incomingMedia[userSession.id].release();
                delete user.incomingMedia[userSession.id];
            }
            // notify all user in the room
            user.sendMessage(data);
        }
        
    }
    // Release pipeline and delete room when room is empty
    if (Object.keys(room.participants).length == 0) {
        console.log('full pipeline released');
        room.pipeline.release();
        delete rooms[userSession.roomName];
    }
    delete userSession.roomName;
    stop(userSession.id);
    leaveRoom(sessionId+'_screen',callback);
    
}

/**
 * Unregister user
 * @param sessionId
 */
function stop(sessionId) {
    userRegistry.unregister(sessionId);
}

/**
 * Invite other user to a (conference) call
 * @param callerId
 * @param to
 * @param from
 */
function call(callerId, to, from) {
    if(to === from){
        return;
    }
    var roomName;
    var caller = userRegistry.getById(callerId);
    var rejectCause = 'User ' + to + ' is not registered';
    if (userRegistry.getByName(to)) {
        var callee = userRegistry.getByName(to);
        if(!caller.roomName){
            roomName = generateUUID();
            joinRoom(caller.socket, roomName);
        }
        else{
            roomName = caller.roomName;
        }
        callee.peer = from;
        caller.peer = to;
        var message = {
            id: 'incomingCall',
            from: from,
            roomName: roomName
        };
        try{
            return callee.sendMessage(message);
        } catch(exception) {
            rejectCause = "Error " + exception;
        }
    }
    var message  = {
        id: 'callResponse',
        response: 'rejected: ',
        message: rejectCause
    };
    caller.sendMessage(message);
}

/**
 * Retrieve sdpOffer from other user, required for WebRTC calls
 * @param socket
 * @param senderId
 * @param sdpOffer
 * @param callback
 */
function receiveVideoFrom(socket, senderId, sdpOffer, callback) {
    var userSession = userRegistry.getById(socket.id);
    var sender = userRegistry.getById(senderId);

    getEndpointForUser(userSession, sender, function (error, endpoint) {
        if (error) {
            callback(error);
        }

        endpoint.processOffer(sdpOffer, function (error, sdpAnswer) {
            if (error) {
                return callback(error);
            }
            var data = {
                id: 'receiveVideoAnswer',
                sessionId: sender.id,
                sdpAnswer: sdpAnswer
            };
            userSession.sendMessage(data);

            endpoint.gatherCandidates(function (error) {
                if (error) {
                    return callback(error);
                }
            });
            return callback(null, sdpAnswer);
        });
    });
}

/**
 * Get user WebRTCEndPoint, Required for WebRTC calls
 * @param userSession
 * @param sender
 * @param callback
 */
function getEndpointForUser(userSession, sender, callback) {
    // request for self media
    if (userSession.id === sender.id) {
        callback(null, userSession.outgoingMedia);
        return;
    }

    var incoming = userSession.incomingMedia[sender.id];
    if (incoming == null) {
        getRoom(userSession.roomName, function (error, room) {
            if (error) {
                return callback(error);
            }
            room.pipeline.create('WebRtcEndpoint', function (error, incomingMedia) {
                if (error) {
                    // no participants in room yet release pipeline
                    if (Object.keys(room.participants).length == 0) {
                        room.pipeline.release();
                    }
                    return callback(error);
                }
                incomingMedia.setMaxVideoSendBandwidth(max_snd_band);
                incomingMedia.setMinVideoSendBandwidth(min_snd_band);
                userSession.incomingMedia[sender.id] = incomingMedia;
                incomingMedia.on('MediaStateChanged', function(event) {
                    var datamsg = {
                            id: 'playstarted',
                            streamId: sender.id
                        };
                        userSession.sendMessage(datamsg);
                    console.log("state_change for incomming Endpoint from "+event.oldState+" to "+event.newState);
                    if ((event.oldState !== event.newState) && (event.newState === 'CONNECTED')) {
                        console.log("I am playing stream");
                        
                    };
                });
                // add ice candidate the get sent before endpoint is established
                var iceCandidateQueue = userSession.iceCandidateQueue[sender.id];
                if (iceCandidateQueue) {
                    while (iceCandidateQueue.length) {
                        var message = iceCandidateQueue.shift();
                        incomingMedia.addIceCandidate(message.candidate);
                    }
                }

                incomingMedia.on('OnIceCandidate', function (event) {
                    var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
                    userSession.sendMessage({
                        id: 'iceCandidate',
                        sessionId: sender.id,
                        candidate: candidate
                    });
                });
                sender.outgoingMedia.connect(incomingMedia, function (error) {
                    if (error) {
                        callback(error);
                    }
                    callback(null, incomingMedia);
                });
            });
        });
    } else {
            sender.outgoingMedia.connect(incoming, function (error) {
            if (error) {
                callback(error);
            }
            callback(null, incoming);
        });
    }
}

/**
 * Add ICE candidate, required for WebRTC calls
 * @param socket
 * @param message
 */
function addIceCandidate(socket, message) {
    var user = userRegistry.getById(socket.id);
    if (user != null) {
        // assign type to IceCandidate
        var candidate = kurento.register.complexTypes.IceCandidate(message.candidate);
        user.addIceCandidate(message, candidate);
    } else {
       
    }
}

/**
 * Retrieve Kurento Client to connect to Kurento Media Server, required for WebRTC calls
 * @param callback
 * @returns {*}
 */
function getKurentoClient(callback) {
    kurento(settings.KURENTOURL, function (error, kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + settings.KURENTOURL;
            return callback(message + ". Exiting with error " + error);
        }

        callback(null, kurentoClient);
    });
}


/**
 * Stop recording room
 */
function stopRecord(roomname,socketId) {
    var room = rooms[roomname];

    if(!room){
        return;
    }

    var usersInRoom = room.participants;

    var data = {
        id: 'stopRecording',
        socketId:socketId
    };

    for (var i in usersInRoom) {
        var user = usersInRoom[i];
        // release viewer from this
        if(user.id == socketId || socketId == false){
            user.outgoingMedia.recorderEndpoint.stop();
            user.outgoingMedia.recorderEndpoint.release();
           // userSession.outgoingMedia.recorderEndpoint.stop();
            //userSession.outgoingMedia.recorderEndpoint.release();
        }
            // notify all user in the room
        user.sendMessage(data);   
    }
}

/**
 * Generate unique ID, used for generating new rooms
 * @returns {string}
 */
 function setConfig(){
    config_data         = fs.readFileSync('/home/ubuntu/nodejs/CONFIG.json', 'utf8');
    config_obj          = JSON.parse(config_data);
    websocket_url       = config_obj['websocket_url'];
    kurento_url         = config_obj['kurento_url'];
    json_path           = config_obj['json_path'];
    admin_user_name     = config_obj['admin_user_name'];
    admin_password      = config_obj['admin_password'];
    httpsPort           = config_obj['httpsPort'];
    cert_path           = config_obj['cert_path'];
    key_path            = config_obj['key_path'];
    record_path         = config_obj['record_path'];
    min_rec_band        = parseInt(config_obj['min_rec_band']);
    max_rec_band        = parseInt(config_obj['max_rec_band']);
    min_snd_band       = parseInt(config_obj['min_snd_band']);
    max_snd_band       = parseInt(config_obj['max_snd_band']);
    record_format       = config_obj['record_format'];
    room_expire        = parseFloat(config_obj['room_expire']); 
 }
function generateUUID(){
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
}
Object.size = function(obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)){
            size++;
        } 
    }
    return size;
};
function authenticate(user,pass){
    if(user == admin_user_name && pass == admin_password){
        return true;
    }else{
        return false;
    }
}
app.use(express.static(path.join(__dirname, 'static')));
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 
app.post('/rest/getUserCount', function (request, result) {
        
       var responseObj     =   {};
       var responseJson    =   '';
       if(authenticate(request.body.username,request.body.password)){
           responseObj['message'] = 'success';
           responseObj['code']    = '200';
           var dataObj            = {};
               dataObj['total_user_count']   = Object.size(userRegistry.usersById);

           responseObj['data']    = dataObj;
           responseJson           = JSON.stringify(responseObj);

       }else{
           responseObj['message'] = 'failed';
           responseObj['code']    = '400';
           var dataObj            = {};
               dataObj['error']   = 'Invalid username or password';
           responseObj['data']    = dataObj;
           responseJson           = JSON.stringify(responseObj);
       }
       result.end(responseJson);
   
})
app.post('/rest/getUserCountInRoom', function (request, result) {
        
       var responseObj     =   {};
       var responseJson    =   '';
       if(authenticate(request.body.username,request.body.password)){
           var roomName             = request.body.room
           var usersInRoom              = 0;
           getRoom(roomName, function (error, room) {
            if (error) {
                callback(error)
            }
            usersInRoom   = room.participants;
          
           });
           responseObj['message'] = 'success';
           responseObj['code']    = '200';
           var dataObj            = {};
               dataObj['total_user_count']   = Object.size(usersInRoom);

           responseObj['data']    = dataObj;
           responseJson           = JSON.stringify(responseObj);

       }else{
           responseObj['message'] = 'failed';
           responseObj['code']    = '400';
           var dataObj            = {};
               dataObj['error']   = 'Invalid username or password';
           responseObj['data']    = dataObj;
           responseJson           = JSON.stringify(responseObj);
       }
       result.end(responseJson);
   
})
/**
*  api for getting userlist
*/
app.post('/rest/getUserList', function (request, result) {
       var responseObj     =   {};
       var responseJson    =   '';
       var existingUserIds = [];
       var errorMsg   = 'Room Not Exist';
       if(authenticate(request.body.username,request.body.password)){
           var roomName             = request.body.room
           var usersInRoom              = 0;
           getRoom(roomName, function (error, room) {
            if (error) {
                errorMsg = 'Room Not Exist';
                callback(error)
            }
            usersInRoom   = room.participants;

            /*
                id: 'ngTGcZTVAQK1Rfd7AAAA',
                userName: 'user',
                role: 'org',
                mode: 'presenter',
                socket: socketobject
                name: 'user',
                roomName: '100'
            */
            
            for (var i in usersInRoom) {
                errorMsg        = 0;
                var ob          = {};
                ob['id']        = usersInRoom[i].id;
                ob['userName']  = usersInRoom[i].userName;
                ob['mode']      = usersInRoom[i].mode;
                ob['name']      = usersInRoom[i].name;
                ob['roomName']  = usersInRoom[i].roomName;
                existingUserIds.push(ob);
            }
           });
           if(errorMsg == 0){
               responseObj['message'] = 'success';
               responseObj['code']    = '200';
               var dataObj            = {};
                   dataObj['userlist']   = existingUserIds;

               responseObj['data']    = dataObj;
               responseJson           = JSON.stringify(responseObj);
           }else{
               responseObj['message'] = 'failed';
               responseObj['code']    = '400';
               var dataObj            = {};
                   dataObj['error']   = errorMsg;
               responseObj['data']    = dataObj;
               responseJson           = JSON.stringify(responseObj);
           }
           

       }else{
           responseObj['message'] = 'failed';
           responseObj['code']    = '400';
           var dataObj            = {};
               dataObj['error']   = 'Invalid username or password';
           responseObj['data']    = dataObj;
           responseJson           = JSON.stringify(responseObj);
       }
       result.end(responseJson);
   
})
/**
*  api for getting all available rooms
*/
app.post('/rest/getRooms', function (request, result) {
       var responseObj     =   {};
       var responseJson    =   '';
       var existingUserIds = [];
       if(authenticate(request.body.username,request.body.password)){
           responseObj['message'] = 'success';
               responseObj['code']    = '200';
               var dataObj            = {};
               var userList           = userRegistry.usersById;
               var roomList = [];
               var room  =  {};
                for (var i in userList) {
                    var roomname = userList[i].roomName;
                    if(!room.hasOwnProperty(roomname)){
                      if(userList[i].roomName)
                       roomList.push(userList[i].roomName); 
                    }
                    room[roomname] = 'true';       
                }
                   dataObj['rooms']   = roomList;

               responseObj['data']    = dataObj;
               responseJson           = JSON.stringify(responseObj);

       }else{
           responseObj['message'] = 'failed';
           responseObj['code']    = '400';
           var dataObj            = {};
               dataObj['error']   = 'Invalid username or password';
           responseObj['data']    = dataObj;
           responseJson           = JSON.stringify(responseObj);
       }
       result.end(responseJson);
   
})

