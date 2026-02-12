
export const ENV = {
  APP_NAME: "Makáme.cz",
  VERSION: "v12",
  DEBUG: (new URLSearchParams(location.search)).get("debug")==="1",
};
