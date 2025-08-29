// YouTube Assistant - Analytics Tool for Google Sheets

// Analytics Engine
class AnalyticsEngine {
  constructor() {
    this.trendingThreshold = 2.0;
  }

  // Calculate how fast videos are getting views
  calculateVelocityMetrics(viewCount, publishedAt) {
    const uploadDate = new Date(publishedAt);
    const now = new Date();
    const hoursElapsed = (now - uploadDate) / (1000 * 60 * 60);
    const daysElapsed = hoursElapsed / 24;

    return {
      viewsPerHour: hoursElapsed > 0 ? (viewCount / hoursElapsed).toFixed(2) : 0,
      viewsPerDay: daysElapsed > 0 ? (viewCount / daysElapsed).toFixed(0) : 0,
      hoursElapsed: hoursElapsed.toFixed(1),
      daysElapsed: daysElapsed.toFixed(1)
    };
  }

  // Find videos with high engagement
  identifyTrendingContent(videoDataset) {
    return videoDataset.filter(video => {
      const engagementRate = this.calculateEngagementRate(
        video.viewCount,
        video.likeCount,
        video.commentCount
      );
      return engagementRate >= this.trendingThreshold;
    });
  }

  // Find best days and times to upload
  analyzeUploadPatterns(videoDataset) {
    const dayStats = {};
    const hourStats = {};

    videoDataset.forEach(video => {
      const date = new Date(video.publishedAt);
      const dayOfWeek = date.getDay();
      const hour = date.getHours();

      dayStats[dayOfWeek] = (dayStats[dayOfWeek] || 0) + 1;
      hourStats[hour] = (hourStats[hour] || 0) + 1;
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const bestDay = Object.keys(dayStats).reduce((a, b) => dayStats[a] > dayStats[b] ? a : b);
    const bestHour = Object.keys(hourStats).reduce((a, b) => hourStats[a] > hourStats[b] ? a : b);

    return {
      bestUploadDay: dayNames[bestDay],
      bestUploadHour: `${bestHour}:00`,
      dayDistribution: dayStats,
      hourDistribution: hourStats
    };
  }

  // Calculate overall performance score (0-100)
  generatePerformanceScore(metrics) {
    const {
      viewCount = 0,
      likeCount = 0,
      commentCount = 0,
      subscriberCount = 0,
      durationSeconds = 0
    } = metrics;

    const engagementRate = this.calculateEngagementRate(viewCount, likeCount, commentCount);
    const normalizedEngagement = Math.min(engagementRate / 10, 1);

    const likeRatio = viewCount > 0 ? Math.min((likeCount / viewCount) * 100, 1) : 0;
    const commentRatio = viewCount > 0 ? Math.min((commentCount / viewCount) * 50, 1) : 0;

    // Duration factor
    let durationFactor = 1;
    if (durationSeconds <= 60) durationFactor = 0.8; // Shorts penalty
    else if (durationSeconds > 1200) durationFactor = 0.9;

    const score = (
      normalizedEngagement * 0.4 +
      likeRatio * 0.3 +
      commentRatio * 0.2 +
      (viewCount > 1000 ? 0.1 : 0)
    ) * durationFactor * 100;

    return Math.round(Math.min(score, 100));
  }

  // Calculate engagement rate percentage
  calculateEngagementRate(views, likes, comments) {
    if (views === 0) return 0;
    return ((likes + comments) / views) * 100;
  }

  // Find content gaps in search results
  identifyContentGaps(videoDataset, searchQuery) {
    const categories = {};
    const durations = { shorts: 0, midForm: 0, longForm: 0 };
    const totalVideos = videoDataset.length;

    videoDataset.forEach(video => {
      categories[video.category] = (categories[video.category] || 0) + 1;

      if (video.durationSeconds <= 60) durations.shorts++;
      else if (video.durationSeconds <= 600) durations.midForm++;
      else durations.longForm++;
    });

    const underrepresentedCategories = Object.keys(categories)
      .filter(cat => (categories[cat] / totalVideos) < 0.1);

    return {
      categoryDistribution: categories,
      durationDistribution: durations,
      underrepresentedCategories,
      suggestions: this.generateContentSuggestions(durations, underrepresentedCategories, searchQuery)
    };
  }

  // Generate content suggestions based on gap analysis
  generateContentSuggestions(durations, underrepresentedCategories, searchQuery) {
    const suggestions = [];

    if (durations.shorts < durations.midForm * 0.3) {
      suggestions.push(`Consider creating Shorts content about "${searchQuery}" - underrepresented format`);
    }
    if (durations.longForm < durations.midForm * 0.2) {
      suggestions.push(`Opportunity for in-depth long-form content on "${searchQuery}"`);
    }

    underrepresentedCategories.forEach(category => {
      suggestions.push(`Low competition in ${category} for "${searchQuery}"`);
    });

    return suggestions;
  }
}

// API Manager
class YouTubeApiManager {
  constructor() {
    this.maxRetries = 3;
    this.baseDelay = 1000;
    this.maxDelay = 30000;
  }

  // Check if API key works
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

  // Make API request with retry logic
  makeApiRequest(url, retryCount = 0) {
    try {
      const response = UrlFetchApp.fetch(url);
      const responseCode = response.getResponseCode();

      if (responseCode === 200) {
        return JSON.parse(response.getContentText());
      }

      if (responseCode === 429) {
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

  // Search for videos
  searchVideos(query, maxResults, pageToken, apiKey) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&pageToken=${pageToken}&key=${apiKey}`;
    return this.makeApiRequest(url);
  }

  // Get video details
  getVideoDetails(videoIds, apiKey) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${apiKey}`;
    return this.makeApiRequest(url);
  }

  // Get channel details
  getChannelDetails(channelIds, apiKey) {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds}&key=${apiKey}`;
    return this.makeApiRequest(url);
  }
}

// Get API key from properties
function getApiKeyFromProperties() {
  const apiKey = PropertiesService.getScriptProperties().getProperty("apiKey");

  if (!apiKey) {
    Browser.msgBox("API Key is not configured. Please set up your API Key first.");
    return null;
  }
  return apiKey;
}

// Monitor API quota usage
function monitorQuotaUsage(requestCount) {
  const dailyQuota = 10000;
  const warningThreshold = 0.8;

  const today = new Date().toDateString();
  const usageKey = `quota_usage_${today}`;
  const currentUsage = parseInt(PropertiesService.getScriptProperties().getProperty(usageKey) || "0");
  const newUsage = currentUsage + (requestCount * 100);

  PropertiesService.getScriptProperties().setProperty(usageKey, newUsage.toString());

  if (newUsage > dailyQuota * warningThreshold) {
    const remainingQuota = dailyQuota - newUsage;
    SpreadsheetApp.getUi().alert(
      `Quota Warning: You've used approximately ${Math.round((newUsage / dailyQuota) * 100)}% of your daily API quota.\n` +
      `Estimated remaining quota: ${remainingQuota} units.\n\n` +
      `Consider reducing result counts or waiting until tomorrow for quota reset.`
    );
  }
}

// Rename sheet with safe characters
function renameSheet(sheet, newName) {
  try {
    if (newName.length > 100) {
      newName = newName.substring(0, 100);
    }
    newName = newName.replace(/[\/\\?*[\]:]/g, "-");
    sheet.setName(newName);
  } catch (error) {
    Logger.log(`Failed to rename sheet: ${error.message}`);
  }
}

// Main function - fetch and analyze YouTube data
function fetchYouTubeData() {
  const apiKey = getApiKeyFromProperties();
  if (!apiKey) return;

  const apiManager = new YouTubeApiManager();
  const analyticsEngine = new AnalyticsEngine();

  if (!apiManager.validateApiKey(apiKey)) {
    SpreadsheetApp.getUi().alert("Invalid API key. Please check your YouTube API key configuration.");
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const searchQuery = sheet.getRange("B1").getValue();
  const maxResults = sheet.getRange("D1").getValue();

  // Input validation
  if (!searchQuery || searchQuery.toString().trim() === "") {
    SpreadsheetApp.getUi().alert(
      "Search Term Required\n\n" +
      "Please enter a search term in cell B1.\n\n" +
      "Examples:\n" +
      "• 'JavaScript tutorial'\n" +
      "• 'cooking recipes'\n" +
      "• 'fitness workout'"
    );
    return;
  }

  if (!maxResults || isNaN(maxResults) || maxResults < 1 || maxResults > 200) {
    SpreadsheetApp.getUi().alert(
      "Invalid Result Count\n\n" +
      "Please enter a valid number between 1 and 200 in cell D1.\n\n" +
      "Recommendations:\n" +
      "• 5-10 for quick analysis\n" +
      "• 25-50 for comprehensive research\n" +
      "• 100+ for market analysis (uses more API quota)"
    );
    return;
  }

  const startTime = new Date().getTime();
  let totalApiCalls = 0;

  try {
    clearSheetDataExceptA1(sheet);
    renameSheet(sheet, searchQuery);

    sheet.getRange("F1").setValue("🔄 Initializing YouTube data fetch...")
      .setFontColor("#1a73e8")
      .setFontWeight("bold");

    sheet.setFrozenRows(2);

    const headers = [
      "Category", "Thumbnail", "Video Title", "Views", "Description",
      "Channel Name", "Subscribers", "Upload Date", "Tags", "Hashtags",
      "Likes", "Like Rate (%)", "Comment Rate (%)", "Engagement Rate (%)",
      "Comments", "Duration", "Content Type", "Performance Score",
      "Views/Day", "High Engagement", "Captions Available"
    ];

    const headerRange = sheet.getRange(2, 1, 1, headers.length);
    headerRange.setValues([headers]);

    if (!sheet.getFilter()) {
      headerRange.createFilter();
    }

    let pageToken = "";
    let totalFetched = 0;
    const allVideoData = []; // Collect data for analysis

    do {
      const batchSize = Math.min(50, maxResults - totalFetched);

      const searchData = apiManager.searchVideos(searchQuery, batchSize, pageToken, apiKey);
      pageToken = searchData.nextPageToken;

      if (!searchData.items || searchData.items.length === 0) {
        break;
      }

      const videoIds = searchData.items.map(item => item.id.videoId).join(",");
      const channelIds = [...new Set(searchData.items.map(item => item.snippet.channelId))].join(",");

      const videoDetailsData = apiManager.getVideoDetails(videoIds, apiKey);
      const channelDetailsData = apiManager.getChannelDetails(channelIds, apiKey);

      totalApiCalls += 3; // search + video details + channel details

      // Create channel subscribers mapping
      const channelSubscribersMap = {};
      channelDetailsData.items.forEach(channel => {
        channelSubscribersMap[channel.id] = channel.statistics.subscriberCount;
      });

      // Process video data
      const videoData = videoDetailsData.items.map(item => {
        const videoId = item.id;
        const title = item.snippet.title;
        const safeTitle = title
          .replace(/[\/\\?*[\]:]/g, "-")
          .replace(/"/g, "'");
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const thumbnailUrl = item.snippet.thumbnails.high?.url || null;
        const description = item.snippet.description || "";
        const shortDescription = truncateDescription(description);
        const channelName = item.snippet.channelTitle;
        const channelId = item.snippet.channelId;
        const publishDate = formatDate(item.snippet.publishedAt);
        const viewCount = item.statistics?.viewCount || 0;
        const likeCount = item.statistics?.likeCount || 0;
        const commentCount = item.statistics?.commentCount || 0;
        const duration = formatDuration(item.contentDetails?.duration);
        const captionsAvailable = item.contentDetails?.caption || false;
        const category = getCategoryName(item.snippet.categoryId);

        const contentTypeInfo = getContentType(item.contentDetails?.duration);
        const hashtags = extractHashtags(title, description);
        const shortsMetrics = calculateShortsMetrics(item.statistics, contentTypeInfo.durationSeconds);

        const velocityMetrics = analyticsEngine.calculateVelocityMetrics(viewCount, item.snippet.publishedAt);
        const performanceScore = analyticsEngine.generatePerformanceScore({
          viewCount: parseInt(viewCount),
          likeCount: parseInt(likeCount),
          commentCount: parseInt(commentCount),
          subscriberCount: parseInt(channelSubscribersMap[channelId] || 0),
          durationSeconds: contentTypeInfo.durationSeconds
        });

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

        return [
          category,
          enhanceThumbnailDisplay(thumbnailUrl),
          `=HYPERLINK("${videoUrl}", "${safeTitle}")`,
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
          performanceScore,
          formatNumber(velocityMetrics.viewsPerDay),
          shortsMetrics.isHighEngagement ? "Yes" : "No",
          captionsAvailable ? "Yes" : "No",
        ];
      });

      // Collect video data for analysis
      videoDetailsData.items.forEach(item => {
        allVideoData.push({
          publishedAt: item.snippet.publishedAt,
          viewCount: parseInt(item.statistics?.viewCount || 0),
          likeCount: parseInt(item.statistics?.likeCount || 0),
          commentCount: parseInt(item.statistics?.commentCount || 0),
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle
        });
      });

      // Add notes for long descriptions
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

      // Apply formatting
      applyConditionalFormatting(sheet, videoData.length, totalFetched);

      // Set column widths
      sheet.setRowHeights(3, videoData.length, 120);
      sheet.setColumnWidths(3, 1, 200);
      sheet.setColumnWidths(5, 1, 300);
      sheet.setColumnWidths(6, 1, 150);

      // Insert data
      sheet.getRange(3 + totalFetched, 1, videoData.length, headers.length).setValues(videoData);
      totalFetched += videoData.length;

      // Update progress
      const progressPercent = Math.round((totalFetched / maxResults) * 100);
      const progressBar = "█".repeat(Math.floor(progressPercent / 5)) + "░".repeat(20 - Math.floor(progressPercent / 5));
      sheet.getRange("F1").setValue(`🔄 Progress: ${progressBar} ${progressPercent}% (${totalFetched}/${maxResults})`);

      if (totalFetched >= maxResults) {
        break;
      }
    } while (pageToken);

    // Content analysis - use original API data instead of formatted sheet data
    const contentGaps = analyticsEngine.identifyContentGaps(allVideoData, searchQuery);
    const uploadPatterns = analyticsEngine.analyzeUploadPatterns(allVideoData);

    // Add analysis summary
    let analysisRow = 3 + totalFetched + 2;
    sheet.getRange(analysisRow, 1).setValue("'=== CONTENT ANALYSIS ===").setFontWeight("bold");
    analysisRow++;

    sheet.getRange(analysisRow, 1).setValue(`Best Upload Day: ${uploadPatterns.bestUploadDay}`);
    analysisRow++;
    sheet.getRange(analysisRow, 1).setValue(`Best Upload Time: ${uploadPatterns.bestUploadHour}`);
    analysisRow++;

    if (contentGaps.suggestions.length > 0) {
      sheet.getRange(analysisRow, 1).setValue("Content Opportunities:").setFontWeight("bold");
      analysisRow++;
      contentGaps.suggestions.forEach(suggestion => {
        sheet.getRange(analysisRow, 1).setValue(`• ${suggestion}`);
        analysisRow++;
      });
    }

    sheet.getRange("F1").setValue(`✅ Completed! Analyzed ${totalFetched} videos for "${searchQuery}"`)
      .setFontColor("#137333")
      .setFontWeight("bold");

    monitorQuotaUsage(totalApiCalls);
  } catch (error) {
    console.log("Full error details:", error);
    sheet.getRange("F1").setValue(`Error: ${error.message}`);

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

// Utility functions
function clearSheetDataExceptA1(sheet) {
  sheet.getRange("A2:Z").clear();
  sheet.getRange("A2:Z").clearNote();
}

function truncateDescription(description, maxLength = 100) {
  return description.length > maxLength
    ? `${description.substring(0, maxLength)}...`
    : description;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function formatNumber(number) {
  return Number(number).toLocaleString();
}

function formatDuration(isoDuration) {
  // Handle null, undefined, or non-string values
  if (!isoDuration || typeof isoDuration !== 'string') {
    return "0:00";
  }

  const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) {
    return "0:00";
  }

  const hours = match[1] ? match[1].slice(0, -1) : "0";
  const minutes = match[2] ? match[2].slice(0, -1) : "00";
  const seconds = match[3] ? match[3].slice(0, -1) : "00";

  return (hours !== "0" ? `${hours}:` : "") +
    `${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`;
}

function getContentType(isoDuration) {
  // Handle null, undefined, or non-string values
  if (!isoDuration || typeof isoDuration !== 'string') {
    return {
      type: "Unknown",
      category: "unknown",
      durationSeconds: 0,
      isShorts: false
    };
  }

  const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) {
    return {
      type: "Unknown",
      category: "unknown",
      durationSeconds: 0,
      isShorts: false
    };
  }

  const hours = match[1] ? parseInt(match[1].slice(0, -1)) : 0;
  const minutes = match[2] ? parseInt(match[2].slice(0, -1)) : 0;
  const seconds = match[3] ? parseInt(match[3].slice(0, -1)) : 0;

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  let type, category;
  if (totalSeconds <= 60) {
    type = "Shorts";
    category = "short-form";
  } else if (totalSeconds <= 600) {
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

function extractHashtags(title, description) {
  const text = `${title} ${description}`;
  const hashtagRegex = /#[\w\u0590-\u05ff]+/g;
  const hashtags = text.match(hashtagRegex) || [];

  return [...new Set(hashtags.map(tag => tag.toLowerCase()))];
}

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
    metrics.viewsPerSecond = durationSeconds > 0 ? viewCount / durationSeconds : 0;
    metrics.isHighEngagement = metrics.engagementRate > 2.0;
  }

  return metrics;
}

function getCategoryName(categoryId) {
  const categories = {
    "1": "Film & Animation", "2": "Autos & Vehicles", "10": "Music",
    "15": "Pets & Animals", "17": "Sports", "19": "Travel & Events",
    "20": "Gaming", "22": "People & Blogs", "23": "Comedy",
    "24": "Entertainment", "25": "News & Politics", "26": "Howto & Style",
    "27": "Education", "28": "Science & Technology"
  };
  return categories[categoryId] || "Unknown";
}

// Formatting functions
function applyConditionalFormatting(sheet, dataLength, startRow) {
  // Performance score color coding
  const performanceRange = sheet.getRange(3 + startRow, 18, dataLength, 1);

  const highPerformanceRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(70)
    .setBackground("#d9ead3")
    .setRanges([performanceRange])
    .build();

  const mediumPerformanceRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(40, 70)
    .setBackground("#fff2cc")
    .setRanges([performanceRange])
    .build();

  const lowPerformanceRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(40)
    .setBackground("#f4cccc")
    .setRanges([performanceRange])
    .build();

  const rules = sheet.getConditionalFormatRules();
  rules.push(highPerformanceRule, mediumPerformanceRule, lowPerformanceRule);
  sheet.setConditionalFormatRules(rules);
}

function enhanceThumbnailDisplay(thumbnailUrl) {
  if (!thumbnailUrl) return "No thumbnail";
  return `=IMAGE("${thumbnailUrl}", 4, 120, 90)`;
}

// Menu and setup functions
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('YouTube Assistant')
    .addItem('Fetch YouTube Data', 'fetchYouTubeData')
    .addItem('Setup New Sheet', 'setupNewSheet')
    .addItem('Configure API Key', 'configureApiKey')
    .addSeparator()
    .addItem('Test Setup', 'testSetup')
    .addItem('Help & Documentation', 'showHelp')
    .addToUi();
}

function setupNewSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const newSheet = spreadsheet.insertSheet();

  newSheet.getRange("A1").setValue("YouTube Assistant").setFontWeight("bold").setFontSize(14);
  newSheet.getRange("B1").setValue("Enter search term here");
  newSheet.getRange("D1").setValue(25);
  newSheet.getRange("F1").setValue("Ready to analyze!");

  newSheet.getRange("A1:F1").setBackground("#f0f0f0");
}

// Simple function to setup API key (as mentioned in README)
function setupApiKey() {
  const apiKey = "YOUR_API_KEY_HERE"; // Replace with your actual API key
  PropertiesService.getScriptProperties().setProperty("apiKey", apiKey);
  console.log("API Key configured successfully!");
}

// Test function to check if everything is working
function testSetup() {
  console.log("🧪 Testing YouTube Assistant setup...");

  try {
    // Test 1: Check if classes exist
    const analytics = new AnalyticsEngine();
    const apiManager = new YouTubeApiManager();
    console.log("✅ Core classes loaded successfully");

    // Test 2: Check API key
    const apiKey = getApiKeyFromProperties();
    if (apiKey && apiKey !== "YOUR_API_KEY_HERE") {
      console.log("✅ API key is configured");
    } else {
      console.log("⚠️ API key not configured or still using placeholder");
    }

    // Test 3: Test basic calculation
    const engagementRate = analytics.calculateEngagementRate(1000, 50, 10);
    console.log(`✅ Analytics working: ${engagementRate}% engagement rate`);

    console.log("🎉 Setup test completed! Ready to use YouTube Assistant.");

  } catch (error) {
    console.log("❌ Setup test failed:", error.message);
    console.log("Please check your code and try again.");
  }
}

function configureApiKey() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'Configure YouTube API Key',
    'Please enter your YouTube Data API v3 key:',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() == ui.Button.OK) {
    const apiKey = result.getResponseText().trim();
    if (apiKey) {
      PropertiesService.getScriptProperties().setProperty("apiKey", apiKey);
      ui.alert('Success!', 'API key has been configured successfully.', ui.ButtonSet.OK);
    } else {
      ui.alert('Error', 'Please enter a valid API key.', ui.ButtonSet.OK);
    }
  }
}

function showHelp() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'YouTube Assistant Help',
    'How to use:\n\n' +
    '1. Enter search term in cell B1\n' +
    '2. Enter number of results in cell D1 (1-200)\n' +
    '3. Click "Fetch YouTube Data" from the menu\n' +
    '4. Wait for analysis to complete\n\n' +
    'Need API key? Visit Google Cloud Console and enable YouTube Data API v3.',
    ui.ButtonSet.OK
  );
}