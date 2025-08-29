# YouTube Assistant

A simple YouTube analytics tool for Google Sheets. Analyze videos from Shorts to long-form content with detailed metrics.

## Features

- **Shorts Support**: Dedicated analytics for videos ≤60 seconds
- **Detailed Metrics**: Views, likes, comments, subscriber counts, engagement rates
- **Trend Analysis**: Hashtag extraction and content categorization
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
- Create credentials → API Key and Copy the API key

### 3. Configure API Key
**Option A: Use the menu (Recommended)**
1. Refresh your Google Sheet to see the YouTube Assistant menu
2. Click **YouTube Assistant** → **Configure API Key** from the menu
3. Enter your API key when prompted
4. Click OK to save

**Option B: Edit the code directly**
1. Find the `setupApiKey()` function in the Apps Script editor
2. Replace `"YOUR_API_KEY_HERE"` with your actual API key
3. Run the `setupApiKey` function once from the Apps Script editor

## How to Use

1. Enter search term in **B1** (e.g., "javascript tutorial")
2. Enter number of results in **D1** (recommended: 25-50)
3. Click **YouTube Assistant** → **Fetch YouTube Data**
4. Wait for completion (progress shown in F1)

## Data Columns

The tool provides these metrics for each video:

- **Category**: Video category (e.g., Education, Entertainment)
- **Thumbnail**: Clickable video preview image
- **Video Title**: Clickable link to the video
- **Views**: Total view count
- **Description**: Video description (truncated for display)
- **Channel Name**: Creator name
- **Subscribers**: Channel subscriber count
- **Upload Date**: When the video was published
- **Tags**: Video tags from creator
- **Hashtags**: Extracted hashtags from title and description
- **Likes**: Total like count
- **Like Rate (%)**: Likes as percentage of views
- **Comment Rate (%)**: Comments as percentage of views
- **Engagement Rate (%)**: Combined engagement metric
- **Comments**: Total comment count
- **Duration**: Video length
- **Content Type**: Shorts/Mid-form/Long-form categorization
- **Performance Score**: 0-100 composite rating
- **Views/Day**: Average daily views since upload
- **High Engagement**: Yes/No indicator for top performers
- **Captions Available**: Whether video has captions

## Tips

- Start with 10-25 results for quick analysis
- Use specific keywords for better results
- Sort by Performance Score to find top content
- Use the built-in filters to analyze data
- Check engagement rates to identify successful content patterns

## Troubleshooting

**"Execution started" but nothing happens?**
1. Check the **Execution log** in Apps Script for error messages
2. Run **YouTube Assistant** → **Test Setup** to check if everything is configured
3. Make sure you configured your API key using the menu or setupApiKey function

**Menu not showing up?**
1. Refresh your Google Sheet (F5 or Ctrl+R)
2. Try running the script again from Apps Script

**"Invalid API key" error?**
- Double-check your API key is copied correctly (no extra spaces)
- Make sure YouTube Data API v3 is enabled in Google Cloud Console
- Try reconfiguring using **YouTube Assistant** → **Configure API Key**
- Run **YouTube Assistant** → **Test Setup** to verify configuration

**Tool running slowly?**
- Use fewer results (10-25 for quick analysis)
- Try more specific search terms
- Check your internet connection

**Getting quota or rate limit errors?**
- Reduce the number of results per search
- Wait a few minutes before trying again

**Still having issues?**
1. Run **YouTube Assistant** → **Test Setup** from the menu
2. Check the execution log in Apps Script for detailed error messages
3. Make sure all the code from `youtube-assistant.js` is copied correctly

---

*Simple YouTube analytics for Google Sheets. No fancy stuff, just the data you need.*
