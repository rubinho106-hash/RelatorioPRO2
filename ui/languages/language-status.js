// CHECK STATUS TEXT
function checkLanguages(value) {
  const statusLanguage = {
    "Novo": "new",
    "Existente": "existing",
    "Reutilizar": "reuse",
    "Temporário": "temporary",
    "Demolição": "demolition"
  };

  const statusKey = statusLanguage[value] || null;

  // customLog("1. (Check Status language) Ouput value: ", statusKey);
  return statusKey;
}