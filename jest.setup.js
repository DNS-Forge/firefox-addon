// jest.setup.js
require("@testing-library/jest-dom");
require("jest-webextension-mock");

const fetchMock = require("jest-fetch-mock");
fetchMock.enableMocks();
