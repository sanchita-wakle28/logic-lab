// js/theme.js
export function initThemeSwitcher() {
  const savedTheme = localStorage.getItem('logic_lab_theme') || 'neon-circuit';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const selector = document.getElementById('themeSelect');
  if (selector) {
    selector.value = savedTheme;
    selector.addEventListener('change', (e) => {
      const chosenTheme = e.target.value;
      document.documentElement.setAttribute('data-theme', chosenTheme);
      localStorage.setItem('logic_lab_theme', chosenTheme);
    });
  }
}

document.addEventListener('DOMContentLoaded', initThemeSwitcher);