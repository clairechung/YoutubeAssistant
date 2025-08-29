# YouTube Assistant

A simple YouTube analytics tool for Google Sheets. Analyze videos from Shorts to long-form content with detailed metrics.

## Features

- **Shorts Support**: Dedicated analytics for videos ≤60 seconds
- **Detailed Metrics**: Views, likes, comments, subscriber counts, engagement rates
- **Trend Analysis**: Hashtag extraction and upload pattern insights
- **Real-time Progress**: Live updates while fetching data
- **Performance Score**: 0-100 composite performance rating


## Setup

### 1. Create Google Sheet & Add Code
1. Go to [Google Sheets](https://sheets.google.com) and create a new sheet
2. Open **Extensions** → **Apps Script**
3. Delete any existing code in the editor
4. Copy and paste ALL the code from `youtube-assistant.js`
5. Save the project (Ctrl+S or Cmd+S)
6. **Important**: Refresh your Google Sheet to see the menu appear

### 2. Get YouTube API Key
- Visit [Google Cloud Console](https://console.cloud.google.com/)
- Create a new project or select existing one
- Enable **YouTube Data API v3** in APIs & Services → Library
- Create credentials → API Key
- Copy the API key

### 3. Configure API Key
**Option A: Use the built-in function**
1. Find the `setupApiKey()` function in the code
2. Replace `"YOUR_API_KEY_HERE"` with your actual API key
3. Run the `setupApiKey` function once

**Option B: Use the menu**
1. Refresh your Google Sheet
2. Click **YouTube Assistant** → **Configure API Key** from the menu
3. Enter your API key when prompted

### 4. Start Using
1. Put search term in cell **B1** (e.g., "cooking recipes")
2. Put number of results in cell **D1** (e.g., 25)
3. Run **YouTube Assistant** → **Fetch YouTube Data** from the menu

## How to Use

1. Enter search term in **B1** (e.g., "javascript tutorial")
2. Enter number of results in **D1** (recommended: 25-50)
3. Click **YouTube Assistant** → **Fetch YouTube Data**
4. Wait for completion (progress shown in F1)

## Data Columns

The tool provides these metrics for each video:

- **Thumbnail**: Clickable video preview
- **Title**: Clickable link to video
- **Views/Likes/Comments**: Basic engagement metrics
- **Channel**: Creator name and subscriber count
- **Duration**: Video length (auto-categorizes as Shorts/Mid-form/Long-form)
- **Performance Score**: 0-100 rating based on engagement
- **Upload Date**: When the video was published
- **Hashtags**: Extracted from title and description

## Tips

- Start with 10-25 results for quick analysis
- Use specific keywords for better results
- Check the content analysis summary at the bottom for insights
- Sort by Performance Score to find top content

## Troubleshooting

**"Execution started" but nothing happens?**
1. Check the **Execution log** in Apps Script for error messages
2. Run **YouTube Assistant** → **Test Setup** to check if everything is configured
3. Make sure you replaced `"YOUR_API_KEY_HERE"` with your actual API key

**Menu not showing up?**
1. Refresh your Google Sheet (F5 or Ctrl+R)
2. Check if the `onOpen()` function ran successfully in Apps Script
3. Try running `onOpen()` manually in the Apps Script editor

**"Invalid API key" error?**
- Double-check your API key is copied correctly
- Make sure YouTube Data API v3 is enabled in Google Cloud Console
- Run the **Test Setup** function to verify configuration

**Hitting quota limits?**
- Wait until tomorrow (quota resets daily)
- Reduce the number of results per search
- Default quota is 10,000 units/day, each search uses ~100-300 units

**Tool running slowly?**
- Use fewer results (10-25 for quick analysis)
- Try more specific search terms
- Check your internet connection

**Still having issues?**
1. Run **YouTube Assistant** → **Test Setup** from the menu
2. Check the execution log in Apps Script for detailed error messages
3. Make sure all the code from `youtube-assistant.js` is copied correctly

---

*Simple YouTube analytics for Google Sheets. No fancy stuff, just the data you need.*
