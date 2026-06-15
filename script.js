const header = document.querySelector(".site-header");

function syncHeaderShadow() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 8);
}

syncHeaderShadow();
window.addEventListener("scroll", syncHeaderShadow, { passive: true });
