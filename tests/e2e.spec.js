/* Testes E2E do Bolos da Bru.
   Cada teste roda em contexto isolado (localStorage limpo), então a aplicação
   sempre parte dos dados de demonstração: 6 produtos, 90 dias de vendas nos
   três canais, 4 encomendas abertas (1 atrasada) e 2 promoções (uma ativa
   para "Ninho com Nutella", uma expirada). */
"use strict";

const { test, expect } = require("@playwright/test");

const STORE_KEY = "bolosdabru-v1";

/* Faz login pelo perfil desejado (admin por padrão). */
async function loginAs(page, role = "admin") {
  const creds = role === "cliente"
    ? { user: "cliente", pass: "cliente123" }
    : { user: "admin", pass: "bru2024" };
  await page.fill("#login-user", creds.user);
  await page.fill("#login-pass", creds.pass);
  await page.click(".login-submit");
  await expect(page.locator("#login-gate")).toBeHidden();
}

/* Abre o app como administrador e carrega os dados de exemplo (o primeiro
   acesso começa vazio). */
async function openApp(page) {
  await page.goto("/");
  await loginAs(page, "admin");
  await page.click("#btn-load-demo");
  await expect(page.locator("#welcome-banner")).toBeHidden();
  await expect(page.locator("#kpi-row .kpi")).toHaveCount(6);
}

async function goTo(page, view) {
  await page.click(`.tab[data-view="${view}"]`);
  await expect(page.locator(`#view-${view}`)).toBeVisible();
}

/* Seleciona um produto no combo de venda pelo nome. */
async function pickProduct(page, name) {
  const value = await page.$$eval(
    "#sale-product option",
    (opts, wanted) => opts.find((o) => o.textContent.includes(wanted))?.value,
    name,
  );
  expect(value, `produto "${name}" deveria estar no combo`).toBeTruthy();
  await page.selectOption("#sale-product", value);
}

/* Lê o estoque exibido no catálogo para um produto. */
async function stockOf(page, name) {
  await goTo(page, "produtos");
  const row = page.locator("#products-table tbody tr", { hasText: name });
  const badge = await row.locator("td").nth(4).textContent();
  const match = badge.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

test.describe("Acesso e permissões", () => {
  test("login inválido mostra erro", async ({ page }) => {
    await page.goto("/");
    await page.fill("#login-user", "admin");
    await page.fill("#login-pass", "senhaerrada");
    await page.click(".login-submit");
    await expect(page.locator("#login-error")).toBeVisible();
    await expect(page.locator("#login-gate")).toBeVisible();
  });

  test("administrador vê todas as abas do sistema", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "admin");
    await expect(page.locator(".tabs")).toBeVisible();
    for (const view of ["dashboard", "vendas", "produtos", "promocoes", "dicas", "loja"]) {
      await expect(page.locator(`.tab[data-view="${view}"]`)).toBeVisible();
    }
    await expect(page.locator("#view-dashboard")).toBeVisible();
  });

  test("cliente entra e vê apenas a loja", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "cliente");
    await expect(page.locator("#view-loja")).toBeVisible();
    // As abas administrativas ficam ocultas para o cliente
    await expect(page.locator(".tabs")).toBeHidden();
    await expect(page.locator("#view-dashboard")).toBeHidden();
    await expect(page.locator("#user-badge")).toContainText("Cliente");
  });

  test("cliente sempre vê o cardápio com sabores e a data preenchida", async ({ page }) => {
    await page.goto("/");
    // Entra como cliente num navegador "novo" (sem dados): a vitrine não pode
    // ficar vazia e a data do pedido deve vir preenchida.
    await loginAs(page, "cliente");
    expect(await page.locator(".shop-item").count()).toBeGreaterThan(0);
    await expect(page.locator(".shop-item-photo svg").first()).toBeVisible();
    await expect(page.locator("#shop-date")).not.toHaveValue("");
  });

  test("sessão persiste após recarregar e logout volta ao login", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "cliente");
    await page.reload();
    // Continua logado como cliente, sem passar pela tela de login de novo
    await expect(page.locator("#login-gate")).toBeHidden();
    await expect(page.locator("#view-loja")).toBeVisible();

    await page.click("#btn-logout");
    await expect(page.locator("#login-gate")).toBeVisible();
  });

  test("atalho de conta de demonstração entra com um clique", async ({ page }) => {
    await page.goto("/");
    await page.click('.login-demo-btn[data-user="admin"]');
    await expect(page.locator("#login-gate")).toBeHidden();
    await expect(page.locator("#view-dashboard")).toBeVisible();
  });
});

test.describe("Primeiro acesso", () => {
  test("começa vazio, sem dados fictícios, e oferece dados de exemplo", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "admin");
    await expect(page.locator("#welcome-banner")).toBeVisible();
    await expect(page.locator("#kpi-row .kpi .value").first()).toHaveText("R$ 0,00");

    await page.click("#btn-load-demo");
    await expect(page.locator("#welcome-banner")).toBeHidden();
    await expect(page.locator("#kpi-row .kpi .value").first()).not.toHaveText("R$ 0,00");
  });

  test("botão de cadastrar produtos leva direto ao formulário", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, "admin");
    await page.click("#btn-goto-products");
    await expect(page.locator("#view-produtos")).toBeVisible();
    await expect(page.locator("#product-name")).toBeFocused();
  });
});

test.describe("Dashboard", () => {
  test("carrega KPIs e os cinco gráficos com dados de demonstração", async ({ page }) => {
    await openApp(page);
    await expect(page.locator("#kpi-row .kpi .label")).toHaveText([
      "Receita", "Vendas", "Potes vendidos", "Ticket médio", "Lucro estimado",
      "Encomendas abertas",
    ]);
    await expect(page.locator("#revenue-chart svg")).toBeVisible();
    expect(await page.locator("#top-products-chart .hbar-row").count()).toBeGreaterThan(0);
    await expect(page.locator("#weekday-chart .col-slot")).toHaveCount(7);
    expect(await page.locator("#payment-chart .stack-seg").count()).toBeGreaterThan(0);
    expect(await page.locator("#channel-chart .stack-seg").count()).toBeGreaterThan(1);
    // Legenda presente nas barras de participação (múltiplas séries)
    expect(await page.locator("#payment-chart .legend .key").count()).toBeGreaterThan(1);
  });

  test("filtro de período re-escopa os números", async ({ page }) => {
    await openApp(page);
    const revenue30 = await page.locator("#kpi-row .kpi .value").first().textContent();
    await page.click('#range-filters .chip[data-days="7"]');
    await expect(page.locator('#range-filters .chip[data-days="7"]')).toHaveClass(/active/);
    const revenue7 = await page.locator("#kpi-row .kpi .value").first().textContent();
    expect(revenue7).not.toBe(revenue30);
    await expect(page.locator("#revenue-chart-sub")).toHaveText("Últimos 7 dias");
  });

  test("gráfico de linha mostra tooltip com crosshair no hover", async ({ page }) => {
    await openApp(page);
    const box = await page.locator("#revenue-chart svg").boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(page.locator("#tooltip")).toBeVisible();
    await expect(page.locator("#tooltip")).toContainText("receita");
  });

  test("todo gráfico oferece visão em tabela", async ({ page }) => {
    await openApp(page);
    await page.locator("#view-dashboard details summary").first().click();
    expect(await page.locator("#revenue-table table tbody tr").count()).toBeGreaterThan(0);
  });
});

test.describe("Fluxo de venda", () => {
  test("registra venda com promoção aplicada automaticamente", async ({ page }) => {
    await openApp(page);
    await goTo(page, "vendas");
    // "Semana do Ninho" (10% em Ninho com Nutella, R$ 17,00) está ativa no seed
    await pickProduct(page, "Ninho com Nutella");
    await page.fill("#sale-qty", "2");
    await page.click("#btn-add-cart");

    await expect(page.locator("#cart-table tbody tr")).toHaveCount(1);
    await expect(page.locator("#cart-table .promo-tag")).toContainText("Semana do Ninho");
    await expect(page.locator("#cart-discount")).toHaveText("−R$ 3,40");
    await expect(page.locator("#cart-total")).toHaveText("R$ 30,60");

    // O histórico na tela é limitado às 100 vendas mais recentes; a inserção
    // é conferida direto nos dados persistidos.
    const countSales = () => page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).sales.length, STORE_KEY,
    );
    const salesBefore = await countSales();
    await page.click("#btn-confirm-sale");
    await expect(page.locator("#toast")).toContainText("Venda registrada: R$ 30,60");
    expect(await countSales()).toBe(salesBefore + 1);
    // O total do histórico já vem líquido do desconto (2 × R$ 17,00 − R$ 3,40)
    const historyRow = page.locator("#sales-table tbody tr", { hasText: "2× Ninho com Nutella" }).first();
    await expect(historyRow).toContainText("R$ 30,60");
    await expect(historyRow).toContainText("Balcão");
    // Carrinho zera após a venda
    await expect(page.locator("#cart-empty")).toBeVisible();
  });

  test("bloqueia venda acima do estoque", async ({ page }) => {
    await openApp(page);
    await goTo(page, "vendas");
    // Prestígio tem apenas 3 no estoque de demonstração
    await pickProduct(page, "Prestígio");
    await page.fill("#sale-qty", "5");
    await page.click("#btn-add-cart");
    await expect(page.locator("#toast")).toContainText("Estoque insuficiente");
    await expect(page.locator("#cart-empty")).toBeVisible();
  });

  /* Cenário controlado: parte do zero e cadastra um produto próprio, para que
     a única venda do histórico seja a criada pelo teste. */
  test("venda baixa o estoque e cancelamento devolve", async ({ page }) => {
    await openApp(page);
    page.on("dialog", (d) => d.accept());
    await goTo(page, "dicas");
    await page.click("#btn-clear-data");
    await goTo(page, "produtos");
    await page.fill("#product-name", "Bolo de Teste");
    await page.fill("#product-price", "1000");
    await page.fill("#product-cost", "400");
    await page.fill("#product-stock", "5");
    await page.click('#product-form button[type="submit"]');

    await goTo(page, "vendas");
    await pickProduct(page, "Bolo de Teste");
    await page.fill("#sale-qty", "2");
    await page.click("#btn-add-cart");
    await page.click("#btn-confirm-sale");
    await expect(page.locator("#toast")).toContainText("Venda registrada");
    expect(await stockOf(page, "Bolo de Teste")).toBe(3);

    await goTo(page, "vendas");
    await expect(page.locator("#sales-table tbody tr")).toHaveCount(1);
    await page.locator("#sales-table tbody tr").getByRole("button", { name: "Cancelar" }).click();
    await expect(page.locator("#sales-table tbody tr")).toContainText("Cancelada");
    expect(await stockOf(page, "Bolo de Teste")).toBe(5);
  });

  test("vendas persistem após recarregar a página", async ({ page }) => {
    await openApp(page);
    page.on("dialog", (d) => d.accept());
    await goTo(page, "dicas");
    await page.click("#btn-clear-data");
    await goTo(page, "produtos");
    await page.fill("#product-name", "Bolo Persistente");
    await page.fill("#product-price", "1200");
    await page.fill("#product-cost", "500");
    await page.fill("#product-stock", "4");
    await page.click('#product-form button[type="submit"]');

    await goTo(page, "vendas");
    await pickProduct(page, "Bolo Persistente");
    await page.click("#btn-add-cart");
    await page.click("#btn-confirm-sale");
    await expect(page.locator("#toast")).toContainText("Venda registrada");

    await page.reload();
    await goTo(page, "vendas");
    await expect(page.locator("#sales-table tbody tr")).toHaveCount(1);
    await expect(page.locator("#sales-table tbody tr")).toContainText("Bolo Persistente");
  });

  test("exporta o histórico em CSV", async ({ page }) => {
    await openApp(page);
    await goTo(page, "vendas");
    const downloadPromise = page.waitForEvent("download");
    await page.click("#btn-export-csv");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^vendas-bolos-da-bru-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test("delivery soma a taxa de entrega ao total e guarda o cliente", async ({ page }) => {
    await openApp(page);
    await goTo(page, "vendas");
    await page.check('input[name="channel"][value="delivery"]');
    await page.fill("#sale-customer", "Mariana Prado");
    await page.fill("#sale-address", "Rua das Flores, 12 — Centro");
    await page.fill("#sale-fee", "700");
    // Cenoura com Chocolate (R$ 13,00, sem promoção) + taxa R$ 7,00
    await pickProduct(page, "Cenoura com Chocolate");
    await page.click("#btn-add-cart");
    await expect(page.locator("#fee-line")).toBeVisible();
    await expect(page.locator("#cart-fee")).toHaveText("R$ 7,00");
    await expect(page.locator("#cart-total")).toHaveText("R$ 20,00");

    await page.click("#btn-confirm-sale");
    await expect(page.locator("#toast")).toContainText("Venda registrada: R$ 20,00");
    const row = page.locator("#sales-table tbody tr", { hasText: "Mariana Prado" }).first();
    await expect(row).toContainText("Delivery");
    await expect(row).toContainText("R$ 20,00");
  });

  test("delivery exige cliente e endereço", async ({ page }) => {
    await openApp(page);
    await goTo(page, "vendas");
    await page.check('input[name="channel"][value="delivery"]');
    await pickProduct(page, "Cenoura com Chocolate");
    await page.click("#btn-add-cart");
    await page.click("#btn-confirm-sale");
    await expect(page.locator("#toast")).toContainText("Informe o cliente e o endereço");
  });
});

test.describe("Encomendas", () => {
  test("encomenda aceita sabor esgotado, fica pendente e vira receita ao concluir", async ({ page }) => {
    await openApp(page);
    await goTo(page, "vendas");
    await page.check('input[name="channel"][value="encomenda"]');
    // Maracujá está esgotado no seed, mas encomenda é produção sob demanda
    await pickProduct(page, "Maracujá");
    await page.fill("#sale-qty", "3");
    await page.click("#btn-add-cart");
    await expect(page.locator("#cart-table tbody tr")).toHaveCount(1);

    await page.fill("#sale-customer", "Dona Rosa");
    await page.fill("#sale-phone", "(11) 91234-5678");
    const dueDate = await page.locator("#sale-due-date").inputValue(); // amanhã, preenchido pelo app
    await page.click("#btn-confirm-sale");
    await expect(page.locator("#toast")).toContainText("Encomenda de Dona Rosa registrada");

    const orderRow = page.locator("#orders-table tbody tr", { hasText: "Dona Rosa" });
    await expect(orderRow).toContainText("3× Maracujá");

    // Pendente não conta como receita; concluída, sim.
    const revenue = (sales) => sales
      .filter((s) => s.status === "ok")
      .reduce((a, s) => a + s.items.reduce((x, it) => x + it.unitPrice * it.qty - it.discount, 0) + (s.deliveryFee || 0), 0);
    const before = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).sales.filter((s) => s.status === "pendente").length, STORE_KEY,
    );
    expect(before).toBeGreaterThan(0);

    await orderRow.getByRole("button", { name: "Concluir" }).click();
    await expect(page.locator("#toast")).toContainText("concluída e somada às vendas");
    await expect(page.locator("#orders-table tbody tr", { hasText: "Dona Rosa" })).toHaveCount(0);
    const status = await page.evaluate(
      ([key, due]) => JSON.parse(localStorage.getItem(key)).sales
        .find((s) => s.customer?.name === "Dona Rosa")?.status, [STORE_KEY, dueDate],
    );
    expect(status).toBe("ok");
  });

  test("encomenda não baixa o estoque pronto", async ({ page }) => {
    await openApp(page);
    const before = await stockOf(page, "Red Velvet");
    await goTo(page, "vendas");
    await page.check('input[name="channel"][value="encomenda"]');
    await pickProduct(page, "Red Velvet");
    await page.click("#btn-add-cart");
    await page.fill("#sale-customer", "Cliente Teste");
    await page.click("#btn-confirm-sale");
    await expect(page.locator("#toast")).toContainText("Encomenda de Cliente Teste");
    expect(await stockOf(page, "Red Velvet")).toBe(before);
  });
});

test.describe("Loja (visão do cliente)", () => {
  test("cliente monta pedido na loja e ele cai nas encomendas abertas", async ({ page }) => {
    await openApp(page);
    await goTo(page, "loja");

    const ninhoCard = page.locator(".shop-item", { hasText: "Ninho com Nutella" });
    await ninhoCard.getByRole("button", { name: /Adicionar um pote/ }).click();
    await ninhoCard.getByRole("button", { name: /Adicionar um pote/ }).click();
    await expect(ninhoCard.locator(".shop-qty")).toHaveText("2");
    // Promoção ativa do seed aplicada no preço da loja: 2 × R$ 15,30
    await expect(page.locator("#shop-total")).toHaveText("R$ 30,60");

    await page.fill("#shop-name", "Beatriz Lima");
    await page.fill("#shop-phone", "(11) 98765-4321");
    await page.check('input[name="shop-fulfil"][value="entrega"]');
    await page.fill("#shop-address", "Av. Brasil, 100 — Jardim América");
    await page.click(".shop-submit");

    await expect(page.locator("#shop-confirmation")).toContainText("Pedido enviado!");
    await expect(page.locator("#shop-confirmation a")).toHaveAttribute("href", /wa\.me/);

    await goTo(page, "vendas");
    const orderRow = page.locator("#orders-table tbody tr", { hasText: "Beatriz Lima" });
    await expect(orderRow).toContainText("2× Ninho com Nutella");
    await expect(orderRow).toContainText("Av. Brasil, 100");
  });

  test("loja exige contato antes de enviar o pedido", async ({ page }) => {
    await openApp(page);
    await goTo(page, "loja");
    await page.locator(".shop-item", { hasText: "Prestígio" })
      .getByRole("button", { name: /Adicionar um pote/ }).click();
    await page.click(".shop-submit");
    await expect(page.locator("#toast")).toContainText("Informe seu nome e telefone");
  });

  test("mostra depoimentos de clientes", async ({ page }) => {
    await openApp(page);
    await goTo(page, "loja");
    await expect(page.locator(".shop-reviews .review")).toHaveCount(3);
    await expect(page.locator(".shop-reviews")).toContainText("Mariana S.");
  });

  test("cliente acompanha o próprio pedido pelo telefone", async ({ page }) => {
    await openApp(page);
    await goTo(page, "loja");
    // Faz um pedido identificável
    await page.locator(".shop-item", { hasText: "Red Velvet" })
      .getByRole("button", { name: /Adicionar um pote/ }).click();
    await page.fill("#shop-name", "Cliente Rastreio");
    await page.fill("#shop-phone", "(11) 91111-2222");
    await page.click(".shop-submit");
    await expect(page.locator("#shop-confirmation")).toContainText("Pedido enviado!");

    // Busca pelos próprios pedidos usando o mesmo telefone
    await page.fill("#track-phone", "11911112222");
    await page.click("#btn-track");
    const result = page.locator("#track-result");
    await expect(result.locator(".track-item")).toHaveCount(1);
    await expect(result).toContainText("Em produção");
    await expect(result).toContainText("Red Velvet");

    // Telefone desconhecido não retorna pedidos
    await page.fill("#track-phone", "11900000000");
    await page.click("#btn-track");
    await expect(page.locator("#track-result")).toContainText("Nenhum pedido encontrado");
  });

  test("cadastro de novidades confirma e evita duplicidade", async ({ page }) => {
    await openApp(page);
    await goTo(page, "loja");
    await page.fill("#signup-name", "Novo Contato");
    await page.fill("#signup-phone", "(11) 93333-4444");
    await page.click("#signup-form button[type=submit]");
    await expect(page.locator("#signup-result")).toContainText("Cadastro feito!");

    // Mesmo telefone novamente → reconhece que já está na lista
    await page.fill("#signup-name", "Novo Contato");
    await page.fill("#signup-phone", "11933334444");
    await page.click("#signup-form button[type=submit]");
    await expect(page.locator("#signup-result")).toContainText("já está na lista");
  });
});

test.describe("Produtos", () => {
  test("cadastra, edita e exclui produto", async ({ page }) => {
    await openApp(page);
    page.on("dialog", (d) => d.accept());
    await goTo(page, "produtos");

    await page.fill("#product-name", "Pistache");
    await page.fill("#product-price", "2000");
    await page.fill("#product-cost", "900");
    await page.fill("#product-stock", "10");
    await page.click('#product-form button[type="submit"]');
    const row = page.locator("#products-table tbody tr", { hasText: "Pistache" });
    await expect(row).toContainText("R$ 20,00");
    await expect(row).toContainText("55%"); // margem calculada

    await row.getByRole("button", { name: "Editar" }).click();
    await page.fill("#product-price", "2200");
    await page.click('#product-form button[type="submit"]');
    await expect(page.locator("#products-table tbody tr", { hasText: "Pistache" })).toContainText("R$ 22,00");

    await page.locator("#products-table tbody tr", { hasText: "Pistache" })
      .getByRole("button", { name: "Excluir" }).click();
    await expect(page.locator("#products-table tbody tr", { hasText: "Pistache" })).toHaveCount(0);
  });

  test("sinaliza estoque esgotado e baixo no catálogo", async ({ page }) => {
    await openApp(page);
    await goTo(page, "produtos");
    await expect(page.locator("#products-table tbody tr", { hasText: "Maracujá" })).toContainText("Esgotado");
    await expect(page.locator("#products-table tbody tr", { hasText: "Prestígio" })).toContainText("baixo");
  });
});

test.describe("Promoções", () => {
  test("promoção criada passa a valer no carrinho", async ({ page }) => {
    await openApp(page);
    await goTo(page, "promocoes");

    await page.fill("#promo-name", "Cenoura em dobro");
    const cenouraValue = await page.$$eval(
      "#promo-product option",
      (opts) => opts.find((o) => o.textContent.includes("Cenoura"))?.value,
    );
    await page.selectOption("#promo-product", cenouraValue);
    await page.selectOption("#promo-type", "percent");
    await page.fill("#promo-value", "20");
    // datas já vêm preenchidas: hoje → +7 dias
    await page.click('#promo-form button[type="submit"]');
    const row = page.locator("#promos-table tbody tr", { hasText: "Cenoura em dobro" });
    await expect(row).toContainText("ativa");

    await goTo(page, "vendas");
    await pickProduct(page, "Cenoura com Chocolate"); // R$ 13,00 → 20% = R$ 2,60
    await page.click("#btn-add-cart");
    await expect(page.locator("#cart-table .promo-tag")).toContainText("Cenoura em dobro");
    await expect(page.locator("#cart-discount")).toHaveText("−R$ 2,60");
  });

  test("rejeita vigência com fim antes do início", async ({ page }) => {
    await openApp(page);
    await goTo(page, "promocoes");
    await page.fill("#promo-name", "Datas invertidas");
    await page.fill("#promo-value", "10");
    await page.fill("#promo-start", "2026-07-10");
    await page.fill("#promo-end", "2026-07-01");
    await page.click('#promo-form button[type="submit"]');
    await expect(page.locator("#toast")).toContainText("A data final deve ser depois da inicial");
    await expect(page.locator("#promos-table tbody tr", { hasText: "Datas invertidas" })).toHaveCount(0);
  });
});

test.describe("Dicas e dados", () => {
  test("gera dica de estoque esgotado a partir dos dados", async ({ page }) => {
    await openApp(page);
    await goTo(page, "dicas");
    await expect(page.locator("#tips-list .tip", { hasText: "está esgotado" })).toContainText("Maracujá");
    expect(await page.locator("#roadmap-list .tip").count()).toBeGreaterThan(3);
  });

  test("alerta encomenda atrasada e produção dos próximos dias", async ({ page }) => {
    await openApp(page);
    await goTo(page, "dicas");
    // O seed traz a encomenda da Mariana com entrega ontem
    await expect(page.locator("#tips-list .tip", { hasText: "está atrasada" })).toContainText("Mariana");
    await expect(page.locator("#tips-list .tip", { hasText: "próximos 2 dias" })).toBeVisible();
  });

  test("apagar tudo leva ao estado vazio e desabilita a venda", async ({ page }) => {
    await openApp(page);
    page.on("dialog", (d) => d.accept());
    await goTo(page, "dicas");
    await page.click("#btn-clear-data");
    await expect(page.locator("#toast")).toContainText("Dados apagados");

    await goTo(page, "vendas");
    await expect(page.locator("#sale-product")).toBeDisabled();
    await goTo(page, "dashboard");
    await expect(page.locator("#kpi-row .kpi .value").first()).toHaveText("R$ 0,00");
    await expect(page.locator("#welcome-banner")).toBeVisible();
  });

  test("WhatsApp configurado entra no link de pedido da loja", async ({ page }) => {
    await openApp(page);
    await goTo(page, "dicas");
    await page.fill("#cfg-whatsapp", "5511999998888");
    await page.click("#btn-save-config");
    await expect(page.locator("#toast")).toContainText("WhatsApp da loja salvo");

    await goTo(page, "loja");
    await page.locator(".shop-item", { hasText: "Prestígio" })
      .getByRole("button", { name: /Adicionar um pote/ }).click();
    await page.fill("#shop-name", "Cliente WhatsApp");
    await page.fill("#shop-phone", "(11) 90000-0000");
    await page.click(".shop-submit");
    await expect(page.locator("#shop-confirmation a"))
      .toHaveAttribute("href", /wa\.me\/5511999998888/);
  });

  test("modo escuro segue a preferência do sistema", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openApp(page);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(13, 13, 13)"); // --page do tema escuro
  });
});
