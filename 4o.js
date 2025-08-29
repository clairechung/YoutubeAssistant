/**
 * YouTube Assistant - Modern YouTube Analytics Tool for Google Sheets
 * Provides comprehensive YouTube video analysis with Shorts support
 */

// ===== API MANAGEMENT CLASS =====

/**
 * Manages YouTube API interactions with rate limiting and error handling
 */
class YouTubeApiManager {
  constructor() {
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 30000; // 30 seconds
  }

  /**
   * Validates the API key by making a test request
   * @param {string} apiKey - The API key to validate
   * @returns {boolean} True if API key is valid
   */
  validateApiKey(apiKey) {
    try {
      const testUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${apiKey}`;
      const response = UrlFetchApp.fetch(testUrl);
      return response.getResponseCode() === 200;
    } catch (error) {
      Logger.log(`API key validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Makes an API request with exponential backoff for rate limiting
   * @param {string} url - The API endpoint URL
   * @param {number} retryCount - Current retry attempt (default: 0)
   * @returns {Object} Parsed JSON response
   */
  makeApiRequest(url, retryCount = 0) {
    try {
      const response = UrlFetchApp.fetch(url);
      const responseCode = response.getResponseCode();

      if (responseCode === 200) {
        return JSON.parse(response.getContentText());
      }

      // Handle different error types
      if (responseCode === 429) {
        // Rate limiting - implement exponential backoff
        if (retryCount < this.maxRetries) {
          const delay = Math.min(this.baseDelay * Math.pow(2, retryCount), this.maxDelay);
          Logger.log(`Rate limited. Retrying in ${delay}ms (attempt ${retryCount + 1})`);
          Utilities.sleep(delay);
          return this.makeApiRequest(url, retryCount + 1);
        }
        throw new Error("Rate limit exceeded. Please try again later.");
      }

      if (responseCode === 403) {
        const errorData = JSON.parse(response.getContentText());
        if (errorData.error.errors[0].reason === "quotaExceeded") {
          throw new Error("Daily API quota exceeded. Please try again tomorrow or upgrade your quota.");
        }
        throw new Error("API access forbidden. Please check your API key permissions.");
      }

      if (responseCode === 401) {
        throw new Error("Invalid API key. Please check your YouTube API key configuration.");
      }

      throw new Error(`API request failed with status ${responseCode}`);

    } catch (error) {
      if (retryCount < this.maxRetries && error.message.includes("network")) {
        const delay = this.baseDelay * Math.pow(2, retryCount);
        Logger.log(`Network error. Retrying in ${delay}ms (attempt ${retryCount + 1})`);
        Utilities.sleep(delay);
        return this.makeApiRequest(url, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Fetches video search results from YouTube API
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results per page
   * @param {string} pageToken - Page token for pagination
   * @param {string} apiKey - YouTube API key
   * @returns {Object} Search results data
   */
  searchVideos(query, maxResults, pageToken, apiKey) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&pageToken=${pageToken}&key=${apiKey}`;
    return this.makeApiRequest(url);
  }

  /**
   * Fetches detailed video information in batch
   * @param {string} videoIds - Comma-separated video IDs
   * @param {string} apiKey - YouTube API key
   * @returns {Object} Video details data
   */
  getVideoDetails(videoIds, apiKey) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`;
    return this.makeApiRequest(url);
  }

  /**
   * Fetches channel information in batch
   * @param {string} channelIds - Comma-separated channel IDs
   * @param {string} apiKey - YouTube API key
   * @returns {Object} Channel details data
   */
  getChannelDetails(channelIds, apiKey) {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds}&key=${apiKey}`;
    return this.makeApiRequest(url);
  }
}

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
 * Monitors and warns about API quota usage
 * @param {number} requestCount - Number of API requests made
 */
function monitorQuotaUsage(requestCount) {
  const dailyQuota = 10000; // Default YouTube API daily quota
  const warningThreshold = 0.8; // Warn at 80% usage
  
  // Store daily usage in PropertiesService
  const today = new Date().toDateString();
  const usageKey = `quota_usage_${today}`;
  const currentUsage = parseInt(PropertiesService.getScriptProperties().getProperty(usageKey) || "0");
  const newUsage = currentUsage + (requestCount * 100); // Approximate cost per request
  
  PropertiesService.getScriptProperties().setProperty(usageKey, newUsage.toString());
  
  // Warn user if approaching quota limit
  if (newUsage > dailyQuota * warningThreshold) {
    const remainingQuota = dailyQuota - newUsage;
    SpreadsheetApp.getUi().alert(
      `Quota Warning: You've used approximately ${Math.round((newUsage/dailyQuota)*100)}% of your daily API quota.\n` +
      `Estimated remaining quota: ${remainingQuota} units.\n\n` +
      `Consider reducing result counts or waiting until tomorrow for quota reset.`
    );
  }
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

  // Initialize API manager
  const apiManager = new YouTubeApiManager();
  
  // Validate API key before proceeding
  if (!apiManager.validateApiKey(apiKey)) {
    SpreadsheetApp.getUi().alert("Invalid API key. Please check your YouTube API key configuration.");
    return;
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
      "Hashtags",
      "Likes",
      "Like Rate (%)",
      "Comment Rate (%)",
      "Engagement Rate (%)",
      "Comments",
      "Duration",
      "Content Type",
      "High Engagement",
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
      // Make paginated API requests using the API manager
      const searchData = apiManager.searchVideos(searchQuery, maxResults, pageToken, apiKey);
      pageToken = searchData.nextPageToken; // Get next page token

      // Collect Video IDs and Channel IDs for batch processing
      const videoIds = searchData.items.map(item => item.id.videoId).join(",");
      const channelIds = searchData.items.map(item => item.snippet.channelId).join(",");

      // Fetch video and channel details in batch using API manager
      const videoDetailsData = apiManager.getVideoDetails(videoIds, apiKey);
      const channelDetailsData = apiManager.getChannelDetails(channelIds, apiKey);

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

        // Enhanced content type classification and analytics
        const contentTypeInfo = getContentType(item.contentDetails.duration);
        const hashtags = extractHashtags(title, description);
        const shortsMetrics = calculateShortsMetrics(item.statistics, contentTypeInfo.durationSeconds);

        const channelSubscribers = channelSubscribersMap[channelId]
          ? formatNumber(channelSubscribersMap[channelId])
          : "No subscriber data";
        const tags = item.snippet.tags ? item.snippet.tags.join(", ") : "";
        const hashtagsText = hashtags.length > 0 ? hashtags.join(", ") : "";

        const likeToViewPercentage = viewCount > 0
          ? `${shortsMetrics.likeRate.toFixed(2)}%`
          : "No views";
        const commentToViewPercentage = commentCount > 0
          ? `${shortsMetrics.commentRate.toFixed(2)}%`
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
          hashtagsText,
          formatNumber(likeCount),
          likeToViewPercentage,
          commentToViewPercentage,
          `${shortsMetrics.engagementRate.toFixed(2)}%`,
          formatNumber(commentCount),
          duration,
          contentTypeInfo.type,
          shortsMetrics.isHighEngagement ? "Yes" : "No",
          captionsAvailable ? "Yes" : "No",
        ]);
      });

      // Add notes for long descriptions, tags, and hashtags
      videoData.forEach((row, index) => {
        const item = videoDetailsData.items[index];
        const description = item.snippet.description || "";
        const tags = item.snippet.tags ? item.snippet.tags.join(", ") : "";
        const hashtags = extractHashtags(item.snippet.title, description);
        
        if (description.length > 100) {
          sheet.getRange(3 + totalFetched + index, 5).setNote(description);
        }
        if (tags.length > 50) {
          sheet.getRange(3 + totalFetched + index, 9).setNote(tags);
        }
        if (hashtags.length > 0) {
          sheet.getRange(3 + totalFetched + index, 10).setNote(`Full hashtags: ${hashtags.join(", ")}`);
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
      sheet.setColumnWidths(7, 3, 100); // Subscribers, upload date, tags
      sheet.setColumnWidths(10, 1, 120); // Hashtags
      sheet.setColumnWidths(11, 5, 70); // Likes, rates, engagement, comments
      sheet.setColumnWidths(16, 3, 80); // Duration, content type, high engagement

      // Configure text wrapping and alignment
      sheet.getRange(3, 3, videoData.length).setWrap(true); // Video title wrapping
      sheet.getRange(3, 5, videoData.length).setWrap(true); // Description wrapping
      sheet.getRange(3, 10, videoData.length).setWrap(true); // Hashtags wrapping
      sheet.getRange(3, 7, videoData.length, 13).setHorizontalAlignment("right"); // Right-align numeric columns

      // Set up content type dropdown validation
      const formatRange = sheet.getRange(3 + totalFetched, 17, videoData.length, 1);
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
    
    // Monitor quota usage (approximate calculation)
    const apiRequestCount = Math.ceil(totalFetched / 50) * 3; // Search + Video Details + Channel Details
    monitorQuotaUsage(apiRequestCount);
  } catch (error) {
    sheet.getRange("F1").setValue(`Error: ${error.message}`);
    
    // Provide user-friendly error messages with suggestions
    let userMessage = `An error occurred: ${error.message}\n\n`;
    
    if (error.message.includes("quota")) {
      userMessage += "Suggestions:\n" +
                    "• Wait until tomorrow for quota reset\n" +
                    "• Consider upgrading your Google Cloud quota\n" +
                    "• Reduce the number of results requested";
    } else if (error.message.includes("API key")) {
      userMessage += "Suggestions:\n" +
                    "• Check that your API key is correct\n" +
                    "• Ensure YouTube Data API v3 is enabled\n" +
                    "• Verify API key permissions in Google Cloud Console";
    } else if (error.message.includes("Rate limit")) {
      userMessage += "Suggestions:\n" +
                    "• Wait a few minutes before trying again\n" +
                    "• Reduce the number of results requested\n" +
                    "• Consider spreading requests over time";
    } else {
      userMessage += "Suggestions:\n" +
                    "• Check your internet connection\n" +
                    "• Try again in a few minutes\n" +
                    "• Verify your search terms are valid";
    }
    
    SpreadsheetApp.getUi().alert(userMessage);
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
 * Determines content type based on video duration with enhanced classification
 * @param {string} isoDuration - ISO 8601 duration string
 * @returns {Object} Content type information with duration in seconds
 */
function getContentType(isoDuration) {
  const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = match[1] ? parseInt(match[1].slice(0, -1)) : 0;
  const minutes = match[2] ? parseInt(match[2].slice(0, -1)) : 0;
  const seconds = match[3] ? parseInt(match[3].slice(0, -1)) : 0;

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  let type, category;
  if (totalSeconds <= 60) {
    type = "Shorts";
    category = "short-form";
  } else if (totalSeconds <= 600) { // Up to 10 minutes
    type = "Mid-form";
    category = "mid-form";
  } else {
    type = "Long-form";
    category = "long-form";
  }

  return {
    type,
    category,
    durationSeconds: totalSeconds,
    isShorts: totalSeconds <= 60
  };
}

/**
 * Extracts hashtags from video title and description
 * @param {string} title - Video title
 * @param {string} description - Video description
 * @returns {string[]} Array of hashtags found
 */
function extractHashtags(title, description) {
  const text = `${title} ${description}`;
  const hashtagRegex = /#[\w\u0590-\u05ff]+/g;
  const hashtags = text.match(hashtagRegex) || [];
  
  // Remove duplicates and return unique hashtags
  return [...new Set(hashtags.map(tag => tag.toLowerCase()))];
}

/**
 * Calculates Shorts-specific engagement metrics
 * @param {Object} stats - Video statistics object
 * @param {number} durationSeconds - Video duration in seconds
 * @returns {Object} Shorts-specific metrics
 */
function calculateShortsMetrics(stats, durationSeconds) {
  const viewCount = parseInt(stats.viewCount) || 0;
  const likeCount = parseInt(stats.likeCount) || 0;
  const commentCount = parseInt(stats.commentCount) || 0;
  
  const metrics = {
    engagementRate: 0,
    likeRate: 0,
    commentRate: 0,
    viewsPerSecond: 0,
    isHighEngagement: false
  };

  if (viewCount > 0) {
    metrics.engagementRate = ((likeCount + commentCount) / viewCount) * 100;
    metrics.likeRate = (likeCount / viewCount) * 100;
    metrics.commentRate = (commentCount / viewCount) * 100;
    
    if (durationSeconds > 0) {
      metrics.viewsPerSecond = viewCount / durationSeconds;
    }
    
    // Consider high engagement for Shorts if engagement rate > 5%
    metrics.isHighEngagement = durationSeconds <= 60 && metrics.engagementRate > 5;
  }

  return metrics;
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
