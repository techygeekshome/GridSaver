# Grid Saver for Instagram

Save the photos, reels and carousels from an Instagram profile or a single post in one go, at the best quality Instagram has. Everything comes down in a single ZIP file.

**Download and full guide:** https://techygeekshome.info/browser-extensions/grid-saver/

## What it does

- **Whole profiles or single posts.** Open a profile and Grid Saver scrolls through it for you, or open one post or reel to save just that.
- **Full-size photos**, every slide of a carousel, and reels and videos as MP4 files.
- **Removes duplicates**, keeping the biggest copy.
- **You choose what goes in**: a preview grid with tick boxes, a minimum size filter and a switch for videos.
- **One ZIP download**, newest first, with the account name and date in every file name, plus an optional CSV of captions and links.

## Install

**Microsoft Edge:** install Grid Saver from the [Edge Add-ons store](https://microsoftedge.microsoft.com/addons/detail/grid-saver-for-instagram/egikinecpdfibmgolllglmgnjjfepfpe). It updates itself.

For other browsers, pick the download from the [latest release](https://github.com/techygeekshome/GridSaver/releases/latest).

| Browser | Download |
|---|---|
| Chrome, Brave, Opera, Vivaldi | `GridSaver-chrome.zip` |
| Microsoft Edge | [Edge Add-ons store](https://microsoftedge.microsoft.com/addons/detail/grid-saver-for-instagram/egikinecpdfibmgolllglmgnjjfepfpe), or `GridSaver-edge.zip` |
| Firefox (142 or newer) | `GridSaver-firefox.zip` |

`GridSaver.zip` is the same package as the Chrome and Edge downloads.

### Chrome, Edge, Brave, Opera and Vivaldi

1. Unzip the download somewhere you'll keep it.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the `grid-saver` folder.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and pick `GridSaver-firefox.zip`.

Firefox removes temporary add-ons when it closes.

### Build it yourself

The code in this repo is the Chromium version. `manifest.firefox.json` is the Firefox manifest. Run `./build.sh` to make every package in `dist/`.

## Use

1. Sign in to Instagram and open a profile, a post or a reel.
2. Click the Grid Saver icon. On a profile it scrolls down and counts the posts as it finds them.
3. A results tab opens with everything it found.
4. Untick anything you don't want and click **Download ZIP**.

If you installed Grid Saver while the page was already open, refresh the page once before you click the icon.

## Privacy

Grid Saver only reads what Instagram already sends to your browser while you look at a page, and only downloads from Instagram's own servers. It has no account, no analytics and sends nothing anywhere else. The only thing it stores is your filter settings, on your own computer.

## Licence

GPL-3.0. Free for everyone, including commercial use.

Grid Saver is an independent tool made by [TechyGeeksHome](https://techygeekshome.info). It is not affiliated with, endorsed by or connected to Instagram or Meta. The photos and videos you save still belong to the people who made them. Only save what you have the right to keep.
