// 🎲 düğmesi için sıfat + hayvan listesi; dil "tr" ("Cesur Tilki") ya da "en" ("Brave Fox").
window.rastgeleAd = (() => {
  const LISTELER = {
    tr: {
      sifatlar: [
        "Cesur", "Hızlı", "Akıllı", "Neşeli", "Sakin", "Çevik", "Meraklı", "Bilge", "Parlak", "Gizemli",
        "Kurnaz", "Sevimli", "Yaman", "Uçan", "Dahi", "Atik", "Gülen", "Sessiz", "Coşkun", "Yıldız",
        "Kararlı", "Şanslı", "Usta", "Minik", "Dev", "Efsane", "Uyanık", "Keskin", "Tatlı", "Cömert",
      ],
      hayvanlar: [
        "Tilki", "Kartal", "Aslan", "Kaplan", "Yunus", "Baykuş", "Panda", "Penguen", "Sincap", "Kurt",
        "Ceylan", "Şahin", "Kunduz", "Zürafa", "Fil", "Ahtapot", "Karınca", "Arı", "Kirpi", "Leylek",
        "Vaşak", "Martı", "Kelebek", "Koala", "Su Samuru", "Papağan", "Kaplumbağa", "Geyik", "Atmaca", "Turna",
      ],
    },
    en: {
      sifatlar: [
        "Brave", "Swift", "Clever", "Happy", "Calm", "Nimble", "Curious", "Wise", "Bright", "Mystic",
        "Sly", "Cute", "Mighty", "Flying", "Genius", "Quick", "Smiling", "Silent", "Bold", "Starry",
        "Steady", "Lucky", "Master", "Tiny", "Giant", "Legend", "Alert", "Sharp", "Sweet", "Kind",
      ],
      hayvanlar: [
        "Fox", "Eagle", "Lion", "Tiger", "Dolphin", "Owl", "Panda", "Penguin", "Squirrel", "Wolf",
        "Gazelle", "Falcon", "Beaver", "Giraffe", "Elephant", "Octopus", "Ant", "Bee", "Hedgehog", "Stork",
        "Lynx", "Seagull", "Butterfly", "Koala", "Otter", "Parrot", "Turtle", "Deer", "Hawk", "Crane",
      ],
    },
  };
  const sec = (liste) => liste[Math.floor(Math.random() * liste.length)];
  return (dil = "tr") => {
    const l = LISTELER[dil] || LISTELER.tr;
    return `${sec(l.sifatlar)} ${sec(l.hayvanlar)}`.slice(0, 20);
  };
})();
