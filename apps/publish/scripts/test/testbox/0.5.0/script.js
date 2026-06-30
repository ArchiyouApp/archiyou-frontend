export default {
    id : "test/testbox/0.5",
    name: "testbox",
    author: "test",
    params: {
       SIZE: {
         type: "number",
         min: 2,
         max: 20,
         default: 10
       }
    },
    code: `
        mainBox = box();
    `,
    published: {
        version: "0.5",
    }

}