export default {
  "id": "archiyou/boxpubtest/1.8.0",
  "name": "boxpubtest",
  "author": "archiyou",
  "description": "test server test server",
  "tags": [],
  "created": "2025-02-13T14:45:42.294Z",
  "updated": "2024-10-28T17:19:00.000Z",
  "code": "// Archiyou 0.5\n\nbox($SIZE)",
  "params": {
    "SIZE": {
      "name": "SIZE",
      "type": "number",
      "label": "SIZE",
      "enabled": true,
      "order": 0,
      "iterable": true,
      "units": "mm",
      "default": 50,
      "schema": {
        "type": "number",
        "default": 50,
        "minimum": 10,
        "maximum": 100,
        "multipleOf": 1
      }
    }
  },
  "presets": {},
  "published": {
    "url": "/archiyou/boxpubtest:1.8.0",
    "version": "1.8.0",
    "title": "BoxPubTest",
    "public": false,
    "published": true,
    "description": "test server test server",
    "params": {
      "SIZE": {
        "name": "SIZE",
        "type": "number",
        "label": "SIZE",
        "enabled": true,
        "order": 0,
        "iterable": true,
        "units": "mm",
        "default": 50,
        "schema": {
          "type": "number",
          "default": 50,
          "minimum": 10,
          "maximum": 100,
          "multipleOf": 1
        }
      }
    },
    "presets": [],
    "libraryUrl": "http://localhost:4000"
  }
};
