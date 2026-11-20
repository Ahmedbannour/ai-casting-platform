// Choisit une option dans une liste déroulante de l'application (app-select), comme le ferait une personne :
// ouvrir la liste, puis toucher l'option.
module.exports = async function choisir(p, name, label) {
  await p.locator(`app-select[name=${name}] button.sf`).click();
  await p.locator('.sf-menu [role=option]').filter({ hasText: label }).first().click();
  await p.waitForTimeout(150);
};
