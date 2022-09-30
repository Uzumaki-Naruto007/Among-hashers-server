const app = require('express')();
const PLAYER_START_X = 330;
const PLAYER_START_Y = 100;
const PLAYER_SPEED = 2;
const SHIP_WIDTH = 2160;
const SHIP_HEIGHT = 1166;
const ROOM_STATE = {};
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: {
    origins: ['http://localhost:8080'],
  },
});

io.on('connection', (socket) => {
  const roomId = socket.handshake.query.room;
  const playerName = socket.handshake.query.name || 'anonymous';
  console.log(roomId);
  console.log('player connected');
  if(ROOM_STATE[roomId]){
    ROOM_STATE[roomId].CLIENTS.push({id:socket.id, x:PLAYER_START_X, y:PLAYER_START_Y});
    ROOM_STATE[roomId].SCORES={...ROOM_STATE[roomId].SCORES, [socket.id]: 0};
    ROOM_STATE[roomId].NAMES={...ROOM_STATE[roomId].NAMES,[socket.id]:playerName };
  } else {
    ROOM_STATE[roomId] = {
      CLIENTS:[{id:socket.id, x:PLAYER_START_X, y:PLAYER_START_Y}],
      bullet_array:[],
      SCORES:{[socket.id]: 0},
      NAMES: {[socket.id]: playerName},
      TIME_REMAINING: 1000 * 60 * 2
    };
  }
  socket.join(roomId);
  io.to(socket.id).emit('id', {id:socket.id, name:ROOM_STATE[roomId].NAMES[socket.id], otherClients: ROOM_STATE[roomId].CLIENTS, room:roomId});
  socket.to(roomId).emit('new player', { id:socket.id });
  socket.on('disconnect', () => {
    ROOM_STATE[roomId].CLIENTS.splice(ROOM_STATE[roomId].CLIENTS.indexOf((client)=>client.id === socket.id), 1);
    socket.to(roomId).emit('delete player', { id:socket.id });
    console.log('player disconnected');
    delete ROOM_STATE[roomId].SCORES[socket.id];
    delete ROOM_STATE[roomId].NAMES[socket.id];
    if(ROOM_STATE[roomId].CLIENTS.length = 0) {
      delete ROOM_STATE[roomId];
    }
  });

  socket.on('move', ({ x, y, id }) => {
    ROOM_STATE[roomId].CLIENTS.forEach((client, index) => {
      if(client.id === id) {
        ROOM_STATE[roomId].CLIENTS[index].x = x;
        ROOM_STATE[roomId].CLIENTS[index].y = y;
      }
    });
    socket.to(roomId).emit('move', { x, y, id });
  });
  socket.on('moveEnd', ({id}) => {
    socket.to(roomId).emit('moveEnd', {id});
  });

  socket.on('shoot-bullet',function(data){
    var new_bullet = data;
    data.owner_id = socket.id; // Attach id of the player to the bullet 
    if(Math.abs(data.speed_x) > 20 || Math.abs(data.speed_y) > 20){
      console.log("Player",socket.id,"is cheating!");
    }
    ROOM_STATE[roomId].bullet_array.push(new_bullet);
  });

  socket.on('player-killed', ({killer, killed})=>{
    io.in(roomId).emit("player-killed",{killer, killed});
  })
});


function ServerGameLoop(){
  for(const roomId of Object.keys(ROOM_STATE)) {
  for(var i=0;i<ROOM_STATE[roomId].bullet_array.length;i++){
    var bullet = ROOM_STATE[roomId].bullet_array[i];
    bullet.x += bullet.speed_x; 
    bullet.y += bullet.speed_y; 
    
    // Check if this bullet is close enough to hit any player 
    for(const id in ROOM_STATE[roomId].CLIENTS){
      if(bullet.owner_id != ROOM_STATE[roomId].CLIENTS[id].id){
        // And your own bullet shouldn't kill you
        var dx = ROOM_STATE[roomId].CLIENTS[id].x - bullet.x; 
        var dy = ROOM_STATE[roomId].CLIENTS[id].y - bullet.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if(dist < 20){
          console.log(dist);
          ROOM_STATE[roomId].SCORES[bullet.owner_id] +=1;
          io.in(roomId).emit('player-hit',ROOM_STATE[roomId].CLIENTS[id].id, ROOM_STATE[roomId].SCORES, ROOM_STATE[roomId].NAMES[bullet.owner_id], ROOM_STATE[roomId].NAMES); // Tell everyone this player got hit
        }
      }
    }
    //|| bullet.x < -10000 || bullet.x > 10000 || bullet.y < -10000 || bullet.y > 10000
    // Remove if it goes too far off screen 
    console.log(bullet.x, bullet.y);
    if(bullet.x < -5000 || bullet.x > 5000 || bullet.y < -5000 || bullet.y > 5000){
      ROOM_STATE[roomId].bullet_array.splice(i,1);
        i--;
    }
        
  }
  // Tell everyone where all the bullets are by sending the whole array
  io.in(roomId).emit("bullets-update",ROOM_STATE[roomId].bullet_array);
}
}
function ServerRemainingTimeLoop(){
  for(const roomId of Object.keys(ROOM_STATE)) {
    if(ROOM_STATE[roomId].TIME_REMAINING <= 0 ) {
      ROOM_STATE[roomId].TIME_REMAINING = 0;
    } else {
      ROOM_STATE[roomId].TIME_REMAINING -= 1000;
    }
    io.in(roomId).emit("time-remaining",ROOM_STATE[roomId].TIME_REMAINING, ROOM_STATE[roomId].SCORES);
  }
}
setInterval(ServerGameLoop, 16);
setInterval(ServerRemainingTimeLoop, 1000); 

const server = app.listen(process.env.PORT || 5000, () => {
  const port = server.address().port;
  console.log(`Express is working on port ${port}`);
});


