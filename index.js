// server prereq
const http = require("http")
const fs = require("fs")
const dotenv = require("dotenv").config({ path: `/root/xen.env` }); 
const port = 4024
const debug = !(process.env.DEBUG === "NO")
const server_start = Date.now()
// variables
let spotify_app = {
    "internal_rate_limit": false,
    "client_id": process.env.SCID,
    "client_secret": process.env.SCS,
    "refresh_token": process.env.SCXRT,
    "access_token": null, // on start
    "last_token_acquiry": null,
    "last_player_request": null,
    "last_auth_successful": null,
    "last_request_successful": null,
    "last_return_spotify_player": {},
    "last_spotify_player_request_empty": false
}
let shitty_request_counter = 0
let xen_pronouns = ["he/him", "they/them"]
// functions
function timepiece_zero(piece, irregular_timepiece, place_count) {
    const pl10 = Math.log10(piece)
    return !irregular_timepiece ? piece != 0 ? piece > 9 ? piece : '0' + piece : '00' : 
    piece != 0 ? 
    piece < Math.pow(10, place_count) ?
    piece === 1 ?
    '0'.repeat(place_count - 1) + '1' : '0'.repeat(place_count - Math.ceil(pl10) - (pl10%1===0?1:0)) + `${piece}`
    : `${piece}`
    : '0'.repeat(place_count) 
} // unused, just leaving it here because of the amount of time and effort i spent on it
// 11/26/2025: boy rewrite this shit THIS INSTANT
function log_stamp() {
    let rn_plus_4 = new Date().toLocaleString("en-US", {timeZone: "Asia/Dubai"})
    return `[${rn_plus_4.valueOf()}] `
}
function on_server_listen() {
    console.log(log_stamp() + "server listening on port " + port)
}
function time_since_begin(ms) {
    return ms != 0 ? `[${Math.round(ms)/1000}s] ` : '[0.000s] '
}
function spotify_access_token_valid() {
    return !(Date.now() - spotify_app.last_token_acquiry > 1800000 || spotify_app.access_token == null)
}
async function spotify_get_access() {
    //console.log("(spotify get access was called)")
    try {  
        await fetch("https://accounts.spotify.com/api/token", 
            {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": "Basic " + btoa(spotify_app.client_id + ':' + spotify_app.client_secret)
                 },
                body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: spotify_app.refresh_token })
            }
        ).then(r=>{
            if(!r.ok) {
                spotify_app.last_auth_successful = false
                throw("http error. status: " + r.status)
            }
            return r.json()
        }).then(function(data) {
            spotify_app.access_token = data.access_token
            spotify_app.last_token_acquiry = Date.now()
            spotify_app.last_auth_successful = true
            if(debug) console.log("access token updated!")
        })
    } catch(ex) {
        console.log("failed while trying to get access token: " + ex)
        if(debug) console.log("access token not updated")
    }
}
async function spotify_player() {
    //console.log("(spotify player was called)")
    try {
        await fetch("https://api.spotify.com/v1/me/player", { headers: { "Authorization": "Bearer " + spotify_app.access_token } })
        .then(function(r) {
            if(!r.ok) {
                spotify_app.last_request_successful = false
                throw("http error. status: " + r.status)
            } else if(r.status === 204) {
                spotify_app.last_request_successful = true
                spotify_app.last_spotify_player_request_empty = true
                throw("its all ok, im just not listening to anything")
            }
            return r.json()
        })
        .then(data => { 
            //fs.writeFileSync("./sample_player_response.json", JSON.stringify(data))
            spotify_app.last_request_successful = true
            spotify_app.last_spotify_player_request_empty = false
            spotify_app.last_return_spotify_player = data
            spotify_app.last_player_request = Date.now()
        })
    } catch(ex) {
        console.log("failed while trying to get player data: " + ex)
    }
}
// main function
const server = http.createServer(async function(request, response) {
    let report = true
    const began_at = Date.now()
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if(/\/alive\/?$/.exec(request.url) && request.method === "GET") {
        response.writeHead(200, {"Content-Type": "application/json"})
        response.end(JSON.stringify({
            alive: true,
            debug: debug,
            uptime_ms : Date.now() - server_start
        }))
    }
    else if(/\/xen\/listen\/?$/.exec(request.url) && request.method === "GET") {
        let return_object
        if(Date.now() - spotify_app.last_player_request < 3600) spotify_app.internal_rate_limit = true
        if(!spotify_access_token_valid()) {
            if(debug) console.log(time_since_begin(Date.now() - began_at) + "authenticating...")        
            await spotify_get_access()
        }
        if(spotify_app.last_auth_successful && !spotify_app.internal_rate_limit) {
            if(debug) console.log(time_since_begin(Date.now() - began_at) + "getting player data...")
            await spotify_player()
        } else console.log(time_since_begin(Date.now() - began_at) + "im not even going to bother getting player data")
        if(debug) console.log(time_since_begin(Date.now() - began_at) + "responding...")
        return_object = spotify_app.last_return_spotify_player
        response.writeHead(200, {"Content-Type": "application/json"})
        response.end(JSON.stringify(
            (spotify_app.last_auth_successful && spotify_app.last_request_successful) ?
            (!spotify_app.last_spotify_player_request_empty) ?
            {
                device: {
                    is_active: return_object.device.is_active,
                    name: return_object.device.name,
                    supports_volume: return_object.device.supports_volume,
                    type: return_object.device.type,
                    volume_percent: return_object.device.supports_volume ? return_object.device.volume_percent : null
                },
                shuffle: {
                    state: return_object.shuffle_state,
                    smart: return_object.smart_shuffle
                },
                repeat_state: return_object.repeat_state,
                is_playing: return_object.is_playing,
                timestamp: return_object.timestamp,
                context: return_object.context,
                progress_ms: return_object.progress_ms,
                item: {
                    album: {
                        album_type: return_object.item.album.album_type,
                        artists: return_object.item.album.artists,
                        images: return_object.item.album.images,
                        name: return_object.item.album.name
                    },
                    artists: return_object.item.artists,
                    duration_ms: return_object.item.duration_ms,
                    explicit: return_object.item.explicit,
                    is_local: return_object.item.is_local,
                    name: return_object.item.name,
                    popularity: return_object.item.popularity
                },
                message: spotify_app.internal_rate_limit ? "returning previously cached spotify request because it was cached less than a second ago" : "none"
            } 
            : {"empty": true}
            : {"message": "server side failed!"}
        ))
        spotify_app.internal_rate_limit = false
    }
    else if(/\/xen\/pronouns\/?$/.exec(request.url) && request.method == "GET") {
        response.writeHead(200, {"Content-Type": "application/json"})
        response.end(JSON.stringify({ pronouns: xen_pronouns }))
    }
    else {
        report = false
        response.writeHead(200, {"Content-Type": "application/json"})
        response.end(JSON.stringify({ message: "You almost had it!" }))
    }
    if(report) console.log(`${log_stamp()}[${request.method}] ${request.url} (took ${Date.now() - began_at}ms)`)
    else shitty_request_counter++
    if(report && shitty_request_counter != 0) { console.log(`(handled ${shitty_request_counter} unreported requests since the last proper request)  `); shitty_request_counter = 0 }
})
// handle listen
server.listen(port, "0.0.0.0", on_server_listen)