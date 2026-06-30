export default {
    id : "test/gsheets/0.5",
    name: "gsheets",
    author: "test",
    params: {
        
    },
    code: `

        testbox = box();

        //// TEST GSHEETS IN PIPELINE ////

        $pipeline('offer', 
            async function(scope) 
            {
                await calc.gsheets.connect('0AH85c2Bl1KO3Uk9PVA');
                await calc.gsheets.fromTemplate(
                        './db/URBUILD_OFFER_TEMPLATE', 
                        './exports/URBUILD_OFFER_FOR_CLIENTXYZ',
                    { width: 550, depth: 650, height: 900 }
                );
            }    
        )
                
        

    `,
    published: {
        version: "0.5",
    }

}