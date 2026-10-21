// Run before the shared editor markup is parsed, without waiting for the app bundle.
document.body.classList.toggle('guided', !new URLSearchParams(location.search).has('editor'));
