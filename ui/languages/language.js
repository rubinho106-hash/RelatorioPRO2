$(document).ready(function () {
  var fixedLanguage = "pt";
  localStorage.setItem("language", fixedLanguage);
  loadLanguage(fixedLanguage);
});

function loadLanguage(language) {
  // Make an AJAX request to load language file
  $.ajax({
    url: "languages/" + language + ".json",
    dataType: "json",
    success: function (data) {
      languageData = data;
      // Replace text of elements with corresponding translations
      $("[data-translate]").each(function () {
        var key = $(this).attr("data-translate");
        var translated = languageData[key];
        if (translated !== undefined && translated !== null && translated !== "") {
          $(this).text(translated);
        }
      });

      // Replace placeholder of input elements with corresponding translations
      $("#findInput").attr("placeholder", languageData.find);
      $("#replaceInput").attr("placeholder", languageData.replace);
      
    },
    error: function () {
      // Handle error loading language file
      console.error("Error loading language file.");
    },
  });
}
