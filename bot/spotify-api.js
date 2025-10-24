const axios = require('axios');

// Spotify API helper using Client Credentials flow
// Usage: const spotify = require('./spotify-api');
// await spotify.init();
// const track = await spotify.getTrack('TRACK_ID');
// const playlistTracks = await spotify.getPlaylistTracks('PLAYLIST_ID');

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) {
    return accessToken;
  }
  const resp = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      }
    }
  );
  accessToken = resp.data.access_token;
  tokenExpiresAt = Date.now() + (resp.data.expires_in * 1000);
  return accessToken;
}

async function getTrack(trackId) {
  const token = await getAccessToken();
  const resp = await axios.get(
    `https://api.spotify.com/v1/tracks/${trackId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return resp.data;
}

async function getPlaylistTracks(playlistId) {
  const token = await getAccessToken();
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  let allTracks = [];
  while (url) {
    const resp = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    allTracks = allTracks.concat(resp.data.items);
    url = resp.data.next;
  }
  return allTracks;
}

module.exports = {
  init: getAccessToken,
  getTrack,
  getPlaylistTracks
};
