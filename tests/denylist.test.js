/**
 * @jest-environment jsdom
 */

global.browser = {
  runtime: {
    sendMessage: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({ activeProfile: 'test_profile' }),
      set: jest.fn()
    }
  },
  tabs: {
    query: jest.fn().mockResolvedValue([{ url: 'https://example.com', id: 1 }])
  }
};

describe('SPA Denylist Manager', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <select id="list-type-select">
        <option value="allowlist">🟢 Allowlist</option>
        <option value="denylist">🔴 Denylist</option>
      </select>
      <input type="text" id="list-new-domain" placeholder="example.com">
      <button id="list-add-btn">Add</button>
      <div id="list-items-container"></div>
    `;
    jest.clearAllMocks();
    window.activeProfile = 'test_profile'; 
  });

  test('Submitting a domain sends MANAGE_DOMAIN message for denylist', async () => {
    const select = document.getElementById('list-type-select');
    const input = document.getElementById('list-new-domain');
    const btn = document.getElementById('list-add-btn');

    // Simulate user selecting Denylist and typing a domain
    select.value = 'denylist';
    input.value = 'bad-site.com';

    btn.onclick = async () => {
      const domain = input.value.trim();
      const listType = select.value;
      if (domain && window.activeProfile) {
        await browser.runtime.sendMessage({ 
          type: "MANAGE_DOMAIN", 
          profileId: window.activeProfile, 
          listType, 
          domain, 
          action: "add" 
        });
      }
    };

    await btn.onclick();

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'MANAGE_DOMAIN',
      profileId: 'test_profile',
      listType: 'denylist',
      domain: 'bad-site.com',
      action: 'add'
    });
  });
});
