// BETA channel of the HLEP DPR web-app.
// Its backend is the BETA Apps Script project (a private copy of the data), never the live one.
// "api" = that project's /exec URL (Deploy → Manage deployments → Web app). Not a secret: every request needs a PIN.
// Until it is filled in, open the beta once with ?api=<the /exec URL> and the phone remembers it.
self.HLEP_CONFIG = {
  channel: 'beta',
  api: '',
  video: 'https://aizuddinreborn.github.io/HLEP-DPR-WebApp/app/media/cara-guna.mp4'
};
