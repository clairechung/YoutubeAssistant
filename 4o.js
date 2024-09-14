var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
var maxResults = sheet.getRange("D1").getValue(); // D1에서 검색 갯수 가져오기

// API 키를 PropertiesService에서 불러오는 함수
function getApiKeyFromProperties() {
  var apiKey = PropertiesService.getScriptProperties().getProperty("apiKey");

  if (!apiKey) {
    Browser.msgBox("API Key가 설정되지 않았습니다. 먼저 API Key를 등록하세요.");
    return null;
  }
  return apiKey;
}

// 시트 이름 변경 함수
function renameSheet(sheet, newName) {
  try {
    // 시트 이름은 100자 제한, "/" 등의 특수문자 사용 불가
    if (newName.length > 100) {
      newName = newName.substring(0, 100); // 100자 이상일 경우 자름
    }

    // 특수문자 "/" 등을 "-"로 변환 (특수문자 금지)
    newName = newName.replace(/[\/\\?*[\]:]/g, "-");

    // 시트 이름 변경
    sheet.setName(newName);
  } catch (error) {
    Logger.log("시트 이름 변경 실패: " + error.message);
  }
}

function fetchYouTubeData() {
  // API 키를 PropertiesService에서 불러옴
  var apiKey = getApiKeyFromProperties();
  if (!apiKey) {
    return; // API 키가 없으면 중지
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var searchQuery = sheet.getRange("B1").getValue(); // 검색어는 B1에서 가져옴
  var maxResults = sheet.getRange("D1").getValue(); // D1에서 검색 갯수 가져오기

  if (!searchQuery) {
    SpreadsheetApp.getUi().alert("검색어를 입력하세요.");
    return;
  }

  if (!maxResults || maxResults < 1 || maxResults > 200) {
    SpreadsheetApp.getUi().alert("검색 갯수를 입력하세요. (1 ~ 200개)");
    return;
  }

  try {
    clearSheetDataExceptA1(sheet);

    renameSheet(sheet, searchQuery);

    // 시트에 F1에 상태 표시
    sheet.getRange("F1").setValue("Fetching data...");

    // 첫 두 줄 고정
    sheet.setFrozenRows(2);

    var headers = [
      "카테고리",
      "썸네일",
      "영상 제목",
      "조회수",
      "영상 설명",
      "채널명",
      "채널 구독자 수",
      "업로드 날짜",
      "태그",
      "좋아요 수",
      "조회수 대비 좋아요 비율",
      "조회수 대비 댓글 비율",
      "댓글 수",
      "영상 길이",
      "숏폼/미드폼",
      "자막 제공 여부", // 총 15개의 열로 헤더 설정
    ];

    var headerRange = sheet.getRange(2, 1, 1, headers.length);
    if (!sheet.getFilter()) {
      headerRange.setValues([headers]).createFilter();
    } else {
      headerRange.setValues([headers]);
    }

    // YouTube API 요청
    var pageToken = "";
    var totalFetched = 0;

    do {
      // 각 페이지별 요청
      var searchUrl =
        "https://www.googleapis.com/youtube/v3/search?part=snippet&q=" +
        encodeURIComponent(searchQuery) +
        "&type=video&maxResults=" +
        maxResults +
        "&pageToken=" +
        pageToken +
        "&key=" +
        apiKey;
      var searchResponse = UrlFetchApp.fetch(searchUrl);

      if (!searchResponse || searchResponse.getResponseCode() !== 200) {
        throw new Error("Search API 호출 실패");
      }

      var searchData = JSON.parse(searchResponse.getContentText());
      pageToken = searchData.nextPageToken; // 다음 페이지 토큰 가져오기

      // Video IDs와 Channel IDs 수집
      var videoIds = searchData.items.map((item) => item.id.videoId).join(",");
      var channelIds = searchData.items
        .map((item) => item.snippet.channelId)
        .join(",");

      // Video details API 호출
      var videoDetailsUrl =
        "https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=" +
        videoIds +
        "&key=" +
        apiKey;
      var videoDetailsResponse = UrlFetchApp.fetch(videoDetailsUrl);
      var videoDetailsData = JSON.parse(videoDetailsResponse.getContentText());

      // Channel details API 호출
      var channelDetailsUrl =
        "https://www.googleapis.com/youtube/v3/channels?part=statistics&id=" +
        channelIds +
        "&key=" +
        apiKey;
      var channelDetailsResponse = UrlFetchApp.fetch(channelDetailsUrl);
      var channelDetailsData = JSON.parse(channelDetailsResponse.getContentText());

      var channelSubscribersMap = {};
      for (var i = 0; i < channelDetailsData.items.length; i++) {
        var channel = channelDetailsData.items[i];
        channelSubscribersMap[channel.id] = channel.statistics.subscriberCount;
      }

      // 데이터를 시트에 추가
      var videoData = [];
      for (var i = 0; i < videoDetailsData.items.length; i++) {
        var item = videoDetailsData.items[i];
        var videoId = item.id;
        var title = item.snippet.title;
        // 제목에서 특수문자 처리 ("/" 등은 "-"로 변경, ""는 ''로 변경)
        var safeTitle = title
          .replace(/[\/\\?*[\]:]/g, "-") // 특수문자 변환
          .replace(/"/g, "'"); // double quote를 single quote로 변환
        var videoUrl = "https://www.youtube.com/watch?v=" + videoId;
        var thumbnailUrl = item.snippet.thumbnails.high
          ? item.snippet.thumbnails.high.url
          : null;
        var description = item.snippet.description || "";
        var shortDescription = truncateDescription(description);
        var channelName = item.snippet.channelTitle;
        var channelId = item.snippet.channelId;
        var publishDate = formatDate(item.snippet.publishedAt);
        var viewCount = item.statistics.viewCount;
        var likeCount = item.statistics.likeCount;
        var commentCount = item.statistics.commentCount;
        var duration = formatDuration(item.contentDetails.duration);
        var captionsAvailable = item.contentDetails.caption;
        var category = getCategoryName(item.snippet.categoryId);

        // 영상 길이에 따라 숏폼/미드폼 판단 (숏폼: 60초 이하)
        var isShortForm = isShortFormVideo(item.contentDetails.duration);

        var channelSubscribers = channelSubscribersMap[channelId]
          ? formatNumber(channelSubscribersMap[channelId])
          : "구독자 수 없음";
        var tags = item.snippet.tags ? item.snippet.tags.join(", ") : "";

        var likeToViewPercentage =
          viewCount > 0
            ? ((likeCount / viewCount) * 100).toFixed(2) + "%"
            : "조회수 없음";
        var commentToViewPercentage =
          commentCount > 0
            ? ((commentCount / viewCount) * 100).toFixed(2) + "%"
            : "댓글 없음";

        videoData.push([
          category,
          thumbnailUrl ? '=IMAGE("' + thumbnailUrl + '")' : "썸네일 없음",
          '=HYPERLINK("' + videoUrl + '", "' + safeTitle + '")', // 변환된 안전한 제목 사용
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
          isShortForm ? "숏폼" : "미드폼",
          captionsAvailable ? "Yes" : "No",
        ]);

        // 설명이 길 경우 노트로 표시
        if (description.length > 100) {
          sheet.getRange(3 + totalFetched + i, 5).setNote(description);
        }
        if (tags.length > 50) {
          sheet.getRange(3 + totalFetched + i, 9).setNote(tags);
        }
      }

      // // 행 추가 (데이터가 많을 경우)
      // if (sheet.getMaxRows() < videoData.length + 3) {
      //   // 기존 행 + 헤더 공간 확보
      //   sheet.insertRowsAfter(
      //     sheet.getMaxRows(),
      //     videoData.length - sheet.getMaxRows() + 3
      //   );
      // }

      // 카테고리를 연한 회색으로 설정
      sheet.getRange(3, 1, videoData.length, 1).setBackground("#f0f0f0"); // 카테고리 열의 배경색을 연한 회색으로

      // 셀 너비 및 정렬 설정
      // sheet.setColumnWidths(2, 1, 160); // 썸네일 열 너비
      sheet.setRowHeights(3, videoData.length, 120); // 썸네일 행 높이

      sheet.setColumnWidths(3, 1, 200); // 영상 제목

      sheet.setColumnWidths(5, 1, 300); // 영상 설명

      sheet.setColumnWidths(6, 1, 150); // 채널명

      sheet.setColumnWidths(7, 3, 100); // 구독자 수, 업로드 날짜, 영상 길이

      sheet.setColumnWidths(10, 4, 70); // 좋아요 수, 좋아요 비율, 댓글 비율, 댓글 수

      sheet.getRange(3, 3, videoData.length).setWrap(true); // 영상 제목 줄바꿈
      sheet.getRange(3, 5, videoData.length).setWrap(true); // 영상 설명 줄바꿈 처리
      sheet.getRange(3, 7, videoData.length, 10).setHorizontalAlignment("right"); // 3번째 행부터 정렬, 7번째인 G열에서 P열까지 10개의 열 오른쪽 정렬

      // 포맷(숏폼/미드폼) 열을 드롭다운으로 설정
      var formatRange = sheet.getRange(3 + totalFetched, 15, videoData.length, 1);
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(["숏폼", "미드폼"])
        .build();
      formatRange.setDataValidation(rule);

      // 데이터를 시트에 추가
      sheet
        .getRange(3 + totalFetched, 1, videoData.length, headers.length)
        .setValues(videoData);

      totalFetched += videoData.length;

      // 카테고리 Wrap 적용
      sheet
        .getRange(3, 1, videoData.length, 1)
        .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
      sheet.getRange(3, 7, videoData.length, 1).setNumberFormat("#,###");

      // 3번째 행부터 정렬, 7번째인 G열에서 P열까지 9개의 열 오른쪽 정렬
      sheet.getRange(3, 7, videoData.length, 10).setHorizontalAlignment("right");

      // Fetch 상태 업데이트
      sheet
        .getRange("F1")
        .setValue("Fetched " + totalFetched + " / " + maxResults + " items.");

      // 최대 검색 갯수에 도달하면 중지
      if (totalFetched >= maxResults) {
        break;
      }
    } while (pageToken);

    // Fetch 완료 메시지
    sheet
      .getRange("F1")
      .setValue("Fetching completed. Total: " + totalFetched + " items.");
  } catch (e) {
    sheet.getRange("F1").setValue("Error: " + e.message);
    SpreadsheetApp.getUi().alert("API 호출 중 오류가 발생했습니다: " + e.message);
  }
}

//A1을 제외한 데이터를 초기화하는 함수
function clearSheetDataExceptA1(sheet) {
  sheet.getRange("A2:Z").clear(); // A1을 제외한 나머지 셀 삭제
  sheet.getRange("A2:Z").clearNote(); // A1, B1을 제외한 나머지 셀의 노트 삭제
}

// 설명을 일정 길이로 줄이는 함수
function truncateDescription(description, maxLength = 100) {
  return description.length > maxLength
    ? description.substring(0, maxLength) + "..."
    : description;
}

// 날짜를 YYYY.MM.DD 형식으로 변환하는 함수
function formatDate(isoString) {
  var date = new Date(isoString);
  var year = date.getFullYear();
  var month = ("0" + (date.getMonth() + 1)).slice(-2); // 두 자리로 유지
  var day = ("0" + date.getDate()).slice(-2);
  return year + "." + month + "." + day;
}

// 숫자를 천 단위로 포맷하는 함수
function formatNumber(number) {
  return Number(number).toLocaleString();
}

// 영상 길이를 보기 좋게 변환하는 함수 (HH:MM:SS 또는 MM:SS)
function formatDuration(isoDuration) {
  var match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  var hours = match[1] ? match[1].slice(0, -1) : "0";
  var minutes = match[2] ? match[2].slice(0, -1) : "00";
  var seconds = match[3] ? match[3].slice(0, -1) : "00";

  return (
    (hours !== "0" ? hours + ":" : "") +
    minutes.padStart(2, "0") +
    ":" +
    seconds.padStart(2, "0")
  );
}

// 숏폼/미드폼 판단 함수 (60초 이하: 숏폼)
function isShortFormVideo(isoDuration) {
  var match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  var hours = match[1] ? parseInt(match[1].slice(0, -1)) : 0;
  var minutes = match[2] ? parseInt(match[2].slice(0, -1)) : 0;
  var seconds = match[3] ? parseInt(match[3].slice(0, -1)) : 0;

  // 총 길이를 초 단위로 계산
  var totalSeconds = hours * 3600 + minutes * 60 + seconds;

  // 60초 이하이면 숏폼으로 간주
  return totalSeconds <= 60;
}

// 카테고리 ID를 카테고리 이름으로 변환하는 함수
function getCategoryName(categoryId) {
  var categories = {
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

////-----////-----////-----////-----////-----////

function onChangeM(e) {
  // Project Triggers 새 시트가 추가되었을 때만 실행
  if (e.changeType === "INSERT_GRID") {
    // 새로 추가된 시트를 가져옴
    var spreadsheet = e.source;
    var sheets = spreadsheet.getSheets();
    var newSheet = sheets[sheets.length - 1]; // 방금 추가된 시트는 마지막 시트
    newSheetSetup(newSheet);
  }
}

function newSheetSetup(newSheet) {
  // A1에 '검색어:' 추가
  newSheet.getRange("A1").setValue("검색어:");
  newSheet.getRange("C1").setValue("검색 갯수:");
  newSheet.getRange("D1").setValue("5");
  newSheet.getRange("E1").setValue("(1~200개)");

  // A1, B1 포맷 설정 (선택사항)
  newSheet.getRange("B1").setFontWeight("bold");
  newSheet.getRange("D1").setFontWeight("bold");
  newSheet.getRange("A1:D1").setBackground("#f0f0f0"); // 배경색 설정
  newSheet.getRange("F1").setFontStyle("italic");

  // A1부터 D1까지 폰트 크기를 13으로 설정
  newSheet.getRange("A1:D1").setFontSize(13);

  // A열의 크기 조정
  newSheet.setColumnWidth(1, 125);
  newSheet.setColumnWidth(2, 160);
}

function addNewSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  // 새 시트 추가 (자동으로 추가된 시트는 마지막 시트가 됨)
  var newSheet = spreadsheet.insertSheet(); // 새 시트 추가

  // 새 시트를 활성화
  newSheet.activate();
  newSheetSetup(newSheet);
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("Youtube Assistant 설정")
    .addItem("새 시트 추가", "addNewSheet") // 새 시트 추가 버튼
    .addItem("다시 검색", "fetchYouTubeData")
    .addSeparator()
    .addItem("API Key 변경", "setApiKeyInProperties")
    .addToUi();
}

// API 키를 변경하는 함수
function setApiKeyInProperties() {
  var userApiKey = Browser.inputBox("API Key를 입력하세요:");

  if (userApiKey) {
    // PropertiesService에 새로운 API 키 저장 (기존 키가 있으면 덮어씀)
    PropertiesService.getScriptProperties().setProperty("apiKey", userApiKey);
    Browser.msgBox("API Key가 성공적으로 등록되었습니다.");
  } else {
    Browser.msgBox("유효한 API Key를 입력해주세요.");
  }
}

function onEditM(e) {
  // Project Triggers
  var sheet = e.source.getActiveSheet();
  var range = e.range;

  // B1 셀이 수정되었을 때만 실행
  if (range.getA1Notation() === "B1") {
    var searchQuery = range.getValue(); // B1의 값을 검색어로 사용
    if (searchQuery) {
      fetchYouTubeData(); // 검색어가 있으면 YouTube 데이터를 가져오는 함수 호출
    }
  }
}
