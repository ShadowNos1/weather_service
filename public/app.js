const form = document.getElementById("f");
const status = document.getElementById("status");
const link = document.getElementById("link");

form.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(form);
  status.textContent = "Загрузка...";
  link.textContent = "";
  try {
    const resp = await fetch("/upload", { method: "POST", body: fd });
    const j = await resp.json();
    if (!j.ok) { status.textContent = "Ошибка"; return; }
    status.textContent = "Готово";
    const url = window.location.origin + j.downloadUrl;
    link.innerHTML = `<a href="${url}" target="_blank">${url}</a>`;
  } catch (err) {
    status.textContent = "Ошибка загрузки";
  }
});
