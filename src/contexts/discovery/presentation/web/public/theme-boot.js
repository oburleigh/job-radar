try {
  const theme = localStorage.getItem("job-radar-theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  }
} catch {}
