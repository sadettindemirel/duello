// 🎲 düğmesi için Türkçe sıfat + hayvan listesi ("Cesur Tilki").
window.rastgeleAd = (() => {
  const SIFATLAR = [
    "Cesur", "Hızlı", "Akıllı", "Neşeli", "Sakin", "Çevik", "Meraklı", "Bilge", "Parlak", "Gizemli",
    "Kurnaz", "Sevimli", "Yaman", "Uçan", "Dahi", "Atik", "Gülen", "Sessiz", "Coşkun", "Yıldız",
    "Kararlı", "Şanslı", "Usta", "Minik", "Dev", "Efsane", "Uyanık", "Keskin", "Tatlı", "Cömert",
  ];
  const HAYVANLAR = [
    "Tilki", "Kartal", "Aslan", "Kaplan", "Yunus", "Baykuş", "Panda", "Penguen", "Sincap", "Kurt",
    "Ceylan", "Şahin", "Kunduz", "Zürafa", "Fil", "Ahtapot", "Karınca", "Arı", "Kirpi", "Leylek",
    "Vaşak", "Martı", "Kelebek", "Koala", "Su Samuru", "Papağan", "Kaplumbağa", "Geyik", "Atmaca", "Turna",
  ];
  const sec = (liste) => liste[Math.floor(Math.random() * liste.length)];
  return () => `${sec(SIFATLAR)} ${sec(HAYVANLAR)}`.slice(0, 20);
})();
