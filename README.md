<p align="center">
<img width="506" height="82" alt="Image" src="https://github.com/user-attachments/assets/3e56ec29-2d5c-4845-9c80-35ced932a246" /><br>
   <a href="https://github.com/netplexflix/Plex-Wrapped-for-Tautulli/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/netplexflix/Plex-Wrapped-for-Tautulli?style=plastic"></a>
   <a href="https://hub.docker.com/repository/docker/netplexflix/pwft"><img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/netplexflix/pwft?style=plastic"></a>
   <a href="https://discord.gg/VBNUJd7tx3"><img alt="Discord" src="https://img.shields.io/discord/1329439972796928041?style=plastic&label=Discord"></a>
</p> 
<br><br>

A year-in-review wrapped report for your Plex server, powered by Tautulli data. Self hosted with Docker.<br>
Beautiful, animated/dynamic statistics and fun facts. With exportable slides for social media sharing.

<img src="https://github.com/user-attachments/assets/2b71e3c1-5d84-4e80-96cb-2e32ded3cf4c" width="15%"></img> <img src="https://github.com/user-attachments/assets/017012e4-ae19-43f5-8f2f-d3b7e7ff911e" width="15%"></img> <img src="https://github.com/user-attachments/assets/9d5f2bfe-743d-4e07-b21e-2c3f02b2535e" width="15%"></img> <img src="https://github.com/user-attachments/assets/ec98307f-ff31-47af-aa7d-ee34277e7575" width="15%"></img> <img src="https://github.com/user-attachments/assets/151f7141-2dc2-4aa2-b498-bdc4093666be" width="15%"></img><br>
<img src="https://github.com/user-attachments/assets/2fa4ba72-d68f-4503-a666-c73b50bc8b31" width="15%"></img> <img src="https://github.com/user-attachments/assets/8129bf9a-3dfa-40ba-840f-29cebd0f1df6" width="15%"></img> <img src="https://github.com/user-attachments/assets/c0a67005-1c9a-40eb-a0a4-5e0acf016e34" width="15%"></img> <img src="https://github.com/user-attachments/assets/4d128df8-3ce4-4a86-ae8a-5aae8eb771c4" width="15%"></img> <img src="https://github.com/user-attachments/assets/0671b81d-01e3-4816-a7c7-5ba43eb31dca" width="15%"></img>

A few examples of what it looks like on mobile:<br>
<img src="https://github.com/user-attachments/assets/31ba5ac0-735e-4706-860b-ac57c6329121" width="25%"></img>


### Prerequisites
- Docker and Docker Compose installed
- A running Tautulli instance

### Quick Start
1. Download the `docker-compose.yml` file from this repository
2. Pull the latest image:
```bash
docker-compose pull
```

3. Start the container:
```bash
docker-compose up -d
```

## Configuration
### Tautulli Connection

1. Access the app at `http://localhost:2025`.
2. Open the Admin Panel and set your Admin password
3. Enter your Tautulli `IP:PORT` and API Key (Find this in Tautulli → Settings → Web Interface → API Key)

### Access Modes

Choose how visitors reach their stats in the Admin Panel (`Settings` tab):

- **Regular:** Anyone with the link can pick any user from a dropdown.
- **Discreet Mode:** Replaces the user dropdown with a username input field. Users need to enter their exact username (NOT 'Friendly name').
  - **Password Protect Users:** Generates a password for each user (see the `Users` tab). Users need their password to see their stats.
- **Plex Login:** Visitors sign in with their Plex account. Only accounts with access to your Plex server can sign in, and they only see their own stats. The server owner can view everyone's stats.

**Allow 'All Users' Stats** (Discreet Mode and Plex Login): lets visitors switch between their own stats and everyone's combined stats. In Discreet Mode the "All Users" report also loads when visiting the site.

> [!NOTE]
> Plex Login identifies your Plex server through Tautulli, so connect Tautulli first. Secrets (Tautulli API key, passwords) are never sent to the browser, and all stats are computed on the server, so visitors can only ever load what their access mode allows.

### Optional Settings

- **Custom Logo:** Upload your custom logo to be used in reports and export slides. You can adjust the size with the slider.
- **Custom Title:** Use a custom title instead of "Plex Wrapped".
- **Normalize Tautulli Anomalies:** Fixes duration anomalies found in Tautulli history by capping watch times to actual runtime.
> [!NOTE]
> When not closed correctly, sessions in Tautulli can keep 'counting', resulting in sometimes days or weeks worth of 'watch history' for a single session.
> This option detects such anomalies and normalizes the session durations to the runtime of the item that was watched.
> To check if you have such anomalies you can check your history tab in Tautulli and sort by duration and look for unrealistically high values:
> 
> <img width="1916" height="316" alt="image" src="https://github.com/user-attachments/assets/6fe10045-d270-42f7-8c7a-cd76ac585f4b" />
- **Streaming Locations:** Will show a globe of where streaming sessions originated from.
- **Show Leaderboard:** Will show a user leaderboard in the "All Users" web report.
- **Show Viewer Ranking:** Tells viewers in the top half how their watch time ranks on your server (e.g. "You watched more than 82% of viewers on this server"). Viewers in the bottom half don't see a ranking.
- **Default Year:** Reports open on the previous year until this date (December 1st by default), then on the current year. Visitors can always pick another year.
- **Installable App:** Set the name and icon the app gets when visitors install it (see below).

## Install as an App
Plex Wrapped can be installed on phones, tablets and computers, so it opens from the home screen like a regular app.

- **Android / Chrome / Edge:** use the browser's *Install app* option, or `Settings` → `Install app` in the report.
- **iPhone / iPad:** tap *Share*, then *Add to Home Screen*.
- In the Admin Panel (`Settings` tab → `Installable App`) you can set the **App Name** (defaults to the title) and upload an **App Icon**. The icon is resized automatically; a square image of at least 512×512 works best.

> [!NOTE]
> Browsers only offer to install sites served over HTTPS, so put Plex Wrapped behind a reverse proxy with a certificate (plain `http://` works for `localhost` only). iPhones can always add it to the home screen.
> Installed apps pick up a new name or icon after a while; on iPhone and iPad, remove the app and add it to the home screen again.

## Stats Cache
The server keeps a local copy of your Tautulli history, together with item metadata and streaming locations, in the `/data` folder. Reports are computed from this cache, so they load in seconds.
The first start after connecting Tautulli builds the cache. Caching the metadata of every title you ever watched can take longer on large servers. You can check the progress in the Cache tab.
Caches are automatically updated nightly.

## Export Slides
In the Admin Panel you can export individual user reports.<br>

- `Full Image` exports one long report with all stats.
- `Story Slides` exports nine 9:16 slides for social media reels.
- You can select multiple users at a time.
- Users will see an `Export Slides` button at the bottom of the web version of their wrapped report to quickly export their own slides.

<img width="815" height="686" alt="Image" src="https://github.com/user-attachments/assets/cbc9bc2f-7676-41bd-96a9-781eeb9a2f6b" />


### ⚠️ **Do you Need Help or have Feedback?**
- Join the [Discord](https://discord.gg/VBNUJd7tx3).
 
---  
### ❤️ Support the Project
If you like this project, please ⭐ star the repository and share it with the community!

<br/>

[!["Buy Me A Coffee"](https://github.com/user-attachments/assets/5c30b977-2d31-4266-830e-b8c993996ce7)](https://www.buymeacoffee.com/neekokeen)