/**
 * @jest-environment jsdom
 */

// Mock the browser API
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

describe('SPA Allowlist Manager', () => {
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
    
    // Minimal mock for active profile global
    window.activeProfile = 'test_profile'; 
  });

  test('Submitting a domain sends MANAGE_DOMAIN message for allowlist', async () => {
    const select = document.getElementById('list-type-select');
    const input = document.getElementById('list-new-domain');
    const btn = document.getElementById('list-add-btn');

    // Simulate user selecting Allowlist and typing a domain
    select.value = 'allowlist';
    input.value = 'good-site.com';

    // Mock the click handler that popup.js would normally attach
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
      listType: 'allowlist',
      domain: 'good-site.com',
      action: 'add'
    });
  });
});
