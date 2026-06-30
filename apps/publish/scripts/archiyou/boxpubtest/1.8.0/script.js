export default {
  id: "archiyou/boxpubtest/1.8.0",
  name: "boxpubtest",
  author: "archiyou",
  description: "test server test server",
  tags: [],
  created: "2025-02-13T14:45:42.294Z",
  updated: "2024-10-28T17:19:00.000Z",
  code: `// Archiyou 0.5

box($SIZE)`,
  params: {
    SIZE: {
      name: "SIZE",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "SIZE",
      default: 50,
      _value: undefined,
      min: 10,
      max: 100,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "mm",
      order: 0,
      iterable: true,
      description: null
    }
  },
  presets: {},
  published: {
    url: "/archiyou/boxpubtest:1.8.0",
    version: "1.8.0",
    title: "BoxPubTest",
    public: false,
    published: "2025-02-13T15:45:42.294575",
    description: "test server test server",
    params: {
      SIZE: {
        MAX_TEXT_LENGTH: 255,
        name: "SIZE",
        id: undefined,
        type: "number",
        enabled: true,
        visible: undefined,
        label: "SIZE",
        default: 50,
        min: 10,
        max: 100,
        step: 1,
        options: undefined,
        length: undefined,
        listElem: undefined,
        schema: undefined,
        units: "mm",
        order: 0,
        iterable: true,
        description: null
      }
    },
    presets: {},
    libraryUrl: "http://localhost:4000"
  }
};
