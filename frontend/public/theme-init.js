(function () {
  var theme = "system";
  try {
    theme = localStorage.getItem("deployforge.theme") || "system";
  } catch (e) {
    /* storage unavailable: fall back to the system preference */
  }
  var dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
