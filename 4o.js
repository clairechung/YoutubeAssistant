/**
 * YouTube Assistant - Modern YouTube Analytics Tool for Google Sheets
 * Provides comprehensive YouTube video analysis with Shorts support
 */

/**
 * Retrieves the YouTube API key from PropertiesService
 * @returns {string|null} The API key or null if not found
 */
function getApiKeyFromProperties() {
  const apiKey = PropertiesService.getScriptProperties().getProperty("apiKey");

  if (!apiKey) {
    Browser.msgBox("API Key is not configured. Please set up your API Key first.");
    return null;
  }
  return apiKey;
}

/**
 * Renames a sheet with safe characters and length limits
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to rename
 * @param {string} newName - The desired new name
 */
function renameSheet(sheet, newName) {
  try {
    // Sheet names have a 100 character limit
    if (newName.length > 100) {
      newName = newName.substring(0, 100);
    }

    // Replace special characters with hyphens (Google Sheets restriction)
    newName = newName.replace(/[\/\\?*[\]:]/g, "-");

    sheet.setName(newName);
  } catch (error) {
    Logger.log(`Failed to rename sheet: ${error.message}`);
  }
}

/**
 * Main function to fetch and process YouTube data
 * Retrieves video information based on search query and populates the spreadsheet
 */
function fetchYouTubeData() {
  const apiKey = getApiKeyFromProperties();
  if (!apiKey) {
    return; // Stop execution if no API key is configured
  }
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const searchQuery = sheet.getRange("B1").getValue(); // Get search term from B1
  const maxResults = sheet.getRange("D1").getValue(); // Get result count from D1

  if (!searchQuery) {
    SpreadsheetApp.getUi().alert("Please enter a search term.");
    return;
  }

  if (!maxResults || maxResults < 1 || maxResults > 200) {
    SpreadsheetApp.getUi().alert("Please enter a valid result count (1-200).");
    return;
  }

  try {
    clearSheetDataExceptA1(sheet);

    renameSheet(sheet, searchQuery);

    // Display status in F1 cell
    sheet.getRange("F1").setValue("Fetching data...");

    // Freeze the first two rows for better navigation
    sheet.setFrozenRows(2);

    const headers = [
      "Category",
      "Thumbnail",
      "Video Title",
      "Views",
      "Description",
      "Channel Name",
      "Subscribers",
      "Upload Date",
      "Tags",
      "Likes",
      "Like Rate (%)",
      "Comment Rate (%)",
      "Comments",
      "Duration",
      "Content Type",
      "Captions Available"
    ];

    const headerRange = sheet.getRange(2, 1, 1, headers.length);
    if (!sheet.getFilter()) {
      headerRange.setValues([headers]).createFilter();
    } else {
      headerRange.setValues([headers]);
    }

    // Initialize YouTube API request variables
    let pageToken = "";
    let totalFetched = 0;

    do {
      // Make paginated API requests
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=${maxResults}&pageToken=${pageToken}&key=${apiKey}`;
      const searchResponse = UrlFetchApp.fetch(searchUrl);

      if (!searchResponse || searchResponse.getResponseCode() !== 200) {
        throw new Error("Search API call failed");
      }

      const searchData = JSON.parse(searchResponse.getContentText());
      pageToken = searchData.nextPageToken; // Get next page token

      // Collect Video IDs and Channel IDs for batch processing
      const videoIds = searchData.items.map(item => item.id.videoId).join(",");
      const channelIds = searchData.items.map(item => item.snippet.channelId).join(",");

      // Fetch video details in batch
      const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`;
      const videoDetailsResponse = UrlFetchApp.fetch(videoDetailsUrl);
      const videoDetailsData = JSON.parse(videoDetailsResponse.getContentText());

      // Fetch channel details in batch
      const channelDetailsUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds}&key=${apiKey}`;
      const channelDetailsResponse = UrlFetchApp.fetch(channelDetailsUrl);
      const channelDetailsData = JSON.parse(channelDetailsResponse.getContentText());

      // Create channel subscribers mapping for quick lookup
      const channelSubscribersMap = {};
      channelDetailsData.items.forEach(channel => {
        channelSubscribersMap[channel.id] = channel.statistics.subscriberCount;
      });

      // Process video data for spreadsheet insertion
      const videoData = [];
      videoDetailsData.items.forEach(item => {
        const videoId = item.id;
        const title = item.snippet.title;
        // Sanitize title for spreadsheet formulas (replace special characters)
        const safeTitle = title
          .replace(/[\/\\?*[\]:]/g, "-") // Replace special characters
          .replace(/"/g, "'"); // Replace double quotes with single quotes
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const thumbnailUrl = item.snippet.thumbnails.high?.url || null;
        const description = item.snippet.description || "";
        const shortDescription = truncateDescription(description);
        const channelName = item.snippet.channelTitle;
        const channelId = item.snippet.channelId;
        const publishDate = formatDate(item.snippet.publishedAt);
        const viewCount = item.statistics.viewCount;
        const likeCount = item.statistics.likeCount;
        const commentCount = item.statistics.commentCount;
        const duration = formatDuration(item.contentDetails.duration);
        const captionsAvailable = item.contentDetails.caption;
        const category = getCategoryName(item.snippet.categoryId);

        // Determine video format based on duration
        const contentType = getContentType(item.contentDetails.duration);

        const channelSubscribers = channelSubscribersMap[channelId]
          ? formatNumber(channelSubscribersMap[channelId])
          : "No subscriber data";
        const tags = item.snippet.tags ? item.snippet.tags.join(", ") : "";

        const likeToViewPercentage = viewCount > 0
          ? `${((likeCount / viewCount) * 100).toFixed(2)}%`
          : "No views";
        const commentToViewPercentage = commentCount > 0
          ? `${((commentCount / viewCount) * 100).toFixed(2)}%`
          : "No comments";

        videoData.push([
          category,
          thumbnailUrl ? `=IMAGE("${thumbnailUrl}")` : "No thumbnail",
          `=HYPERLINK("${videoUrl}", "${safeTitle}")`, // Use sanitized title
          formatNumber(viewCount),
          shortDescription,
          channelName,
          channelSubscribers,
          publishDate,
          tags,
          formatNumber(likeCount),
          likeToViewPercentage,
          commentToViewPercentage,
          formatNumber(commentCount),
          duration,
          contentType,
          captionsAvailable ? "Yes" : "No",
        ]);
      });

      // Add notes for long descriptions and tags
      videoData.forEach((row, index) => {
        const item = videoDetailsData.items[index];
        const description = item.snippet.description || "";
        const tags = item.snippet.tags ? item.snippet.tags.join(", ") : "";
        
        if (description.length > 100) {
          sheet.getRange(3 + totalFetched + index, 5).setNote(description);
        }
        if (tags.length > 50) {
          sheet.getRange(3 + totalFetched + index, 9).setNote(tags);
        }
      });

      // Apply formatting and styling
      // Set category column background to light gray
      sheet.getRange(3, 1, videoData.length, 1).setBackground("#f0f0f0");

      // Configure column widths and row heights for better readability
      sheet.setRowHeights(3, videoData.length, 120); // Thumbnail row height
      sheet.setColumnWidths(3, 1, 200); // Video title
      sheet.setColumnWidths(5, 1, 300); // Description
      sheet.setColumnWidths(6, 1, 150); // Channel name
      sheet.setColumnWidths(7, 3, 100); // Subscribers, upload date, duration
      sheet.setColumnWidths(10, 4, 70); // Likes, like rate, comment rate, comments

      // Configure text wrapping and alignment
      sheet.getRange(3, 3, videoData.length).setWrap(true); // Video title wrapping
      sheet.getRange(3, 5, videoData.length).setWrap(true); // Description wrapping
      sheet.getRange(3, 7, videoData.length, 10).setHorizontalAlignment("right"); // Right-align numeric columns

      // Set up content type dropdown validation
      const formatRange = sheet.getRange(3 + totalFetched, 15, videoData.length, 1);
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(["Shorts", "Mid-form", "Long-form"])
        .build();
      formatRange.setDataValidation(rule);

      // Insert data into spreadsheet
      sheet.getRange(3 + totalFetched, 1, videoData.length, headers.length).setValues(videoData);

      totalFetched += videoData.length;

      // Apply additional formatting
      sheet.getRange(3, 1, videoData.length, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
      sheet.getRange(3, 7, videoData.length, 1).setNumberFormat("#,###");
      sheet.getRange(3, 7, videoData.length, 10).setHorizontalAlignment("right");

      // Update fetch progress status
      sheet.getRange("F1").setValue(`Fetched ${totalFetched} / ${maxResults} items.`);

      // Stop if we've reached the maximum requested results
      if (totalFetched >= maxResults) {
        break;
      }
    } while (pageToken);

    // Display completion message
    sheet.getRange("F1").setValue(`Fetching completed. Total: ${totalFetched} items.`);
  } catch (error) {
    sheet.getRange("F1").setValue(`Error: ${error.message}`);
    SpreadsheetApp.getUi().alert(`An error occurred during API call: ${error.message}`);
  }
}

/**
 * Clears sheet data except for the header row (A1)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to clear
 */
function clearSheetDataExceptA1(sheet) {
  sheet.getRange("A2:Z").clear(); // Clear all cells except A1
  sheet.getRange("A2:Z").clearNote(); // Clear all notes except A1
}

/**
 * Truncates description text to specified length
 * @param {string} description - The description to truncate
 * @param {number} maxLength - Maximum length (default: 100)
 * @returns {string} Truncated description with ellipsis if needed
 */
function truncateDescription(description, maxLength = 100) {
  return description.length > maxLength
    ? `${description.substring(0, maxLength)}...`
    : description;
}

/**
 * Formats ISO date string to YYYY.MM.DD format
 * @param {string} isoString - ISO date string from YouTube API
 * @returns {string} Formatted date string
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

/**
 * Formats numbers with locale-specific thousand separators
 * @param {number|string} number - The number to format
 * @returns {string} Formatted number string
 */
function formatNumber(number) {
  return Number(number).toLocaleString();
}

/**
 * Converts ISO 8601 duration to readable format (HH:MM:SS or MM:SS)
 * @param {string} isoDuration - ISO 8601 duration string (e.g., "PT4M13S")
 * @returns {string} Formatted duration string
 */
function formatDuration(isoDuration) {
  const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = match[1] ? match[1].slice(0, -1) : "0";
  const minutes = match[2] ? match[2].slice(0, -1) : "00";
  const seconds = match[3] ? match[3].slice(0, -1) : "00";

  return (hours !== "0" ? `${hours}:` : "") +
         `${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`;
}

/**
 * Determines content type based on video duration
 * @param {string} isoDuration - ISO 8601 duration string
 * @returns {string} Content type: "Shorts", "Mid-form", or "Long-form"
 */
function getContentType(isoDuration) {
  const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = match[1] ? parseInt(match[1].slice(0, -1)) : 0;
  const minutes = match[2] ? parseInt(match[2].slice(0, -1)) : 0;
  const seconds = match[3] ? parseInt(match[3].slice(0, -1)) : 0;

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  if (totalSeconds <= 60) return "Shorts";
  if (totalSeconds <= 600) return "Mid-form"; // Up to 10 minutes
  return "Long-form";
}

/**
 * Converts YouTube category ID to category name
 * @param {string|number} categoryId - YouTube category ID
 * @returns {string} Human-readable category name
 */
function getCategoryName(categoryId) {
  const categories = {
    1: "Film & Animation",
    2: "Autos & Vehicles",
    10: "Music",
    15: "Pets & Animals",
    17: "Sports",
    20: "Gaming",
    22: "People & Blogs",
    23: "Comedy",
    24: "Entertainment",
    25: "News & Politics",
    26: "How-to & Style",
    27: "Education",
    28: "Science & Technology",
  };
  return categories[categoryId] || "Unknown Category";
}

// ===== EVENT HANDLERS AND UI FUNCTIONS =====

/**
 * Handles spreadsheet change events (Project Trigger)
 * Automatically sets up new sheets when they are created
 * @param {GoogleAppsScript.Events.SheetsOnChange} e - Change event object
 */
function onChangeM(e) {
  // Execute only when a new sheet is added
  if (e.changeType === "INSERT_GRID") {
    const spreadsheet = e.source;
    const sheets = spreadsheet.getSheets();
    const newSheet = sheets[sheets.length - 1]; // Most recently added sheet
    newSheetSetup(newSheet);
  }
}

/**
 * Sets up a new sheet with proper labels and formatting
 * @param {GoogleAppsScript.Spreadsheet.Sheet} newSheet - The sheet to set up
 */
function newSheetSetup(newSheet) {
  // Set up input labels and default values
  newSheet.getRange("A1").setValue("Search Term:");
  newSheet.getRange("C1").setValue("Result Count:");
  newSheet.getRange("D1").setValue("5");
  newSheet.getRange("E1").setValue("(1-200)");

  // Apply formatting to input cells
  newSheet.getRange("B1").setFontWeight("bold");
  newSheet.getRange("D1").setFontWeight("bold");
  newSheet.getRange("A1:D1").setBackground("#f0f0f0");
  newSheet.getRange("F1").setFontStyle("italic");
  newSheet.getRange("A1:D1").setFontSize(13);

  // Adjust column widths for better readability
  newSheet.setColumnWidth(1, 125);
  newSheet.setColumnWidth(2, 160);
}

/**
 * Creates and sets up a new sheet for YouTube analysis
 */
function addNewSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const newSheet = spreadsheet.insertSheet();
  
  newSheet.activate();
  newSheetSetup(newSheet);
}

/**
 * Creates custom menu when spreadsheet opens
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("YouTube Assistant")
    .addItem("Add New Sheet", "addNewSheet")
    .addItem("Fetch Data", "fetchYouTubeData")
    .addSeparator()
    .addItem("Configure API Key", "setApiKeyInProperties")
    .addToUi();
}

/**
 * Prompts user to set or update YouTube API key
 */
function setApiKeyInProperties() {
  const userApiKey = Browser.inputBox("Enter your YouTube API Key:");

  if (userApiKey && userApiKey !== "cancel") {
    PropertiesService.getScriptProperties().setProperty("apiKey", userApiKey);
    Browser.msgBox("API Key has been successfully configured.");
  } else {
    Browser.msgBox("Please enter a valid API Key.");
  }
}

/**
 * Handles cell edit events (Project Trigger)
 * Automatically fetches data when search term is entered in B1
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - Edit event object
 */
function onEditM(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;

  // Auto-fetch data when B1 (search term) is modified
  if (range.getA1Notation() === "B1") {
    const searchQuery = range.getValue();
    if (searchQuery) {
      fetchYouTubeData();
    }
  }
}
