export default {
    id : "test/pipeline/0.5",
    name: "pipeline",
    author: "test",
    params: {
       "SIZE": {
            type: "number",
            default: 50,
            min: 50,
            max: 500,
            step: 1,
            label: "Size"
       }
    },
    code: `
        
        mainBox = box($SIZE,100,100).moveZ(50);
        console.log(mainBox.bbox().width());
        smallBox = box(50,50,50).moveZ(150);

        function someFunction()
        {
            // Access to mainBox from function defined in main scope
            funcBox = mainBox.scale(0.5);
            // return funcBox;    
        }

        //function docPipeline(mainScope)
        docPipeline = function(mainScope) // <== This is not different to function(){...}
        {
            console.log('======= PIPELINE TECHDRAW ======');
            // IMPORTANT: On first run of this function mainBox is set correctly
            // On second run it is not updated, while mainScope.mainBox is
            console.log(mainBox.bbox().width()); // ===> NOT UPDATED ON SECOND RUN
            console.log(mainScope.mainBox.bbox().width()); // ==> UP TO DATE
            iso = mainScope.all().iso().moveTo(0,0,0);
            console.log('==== ISO ====');
            console.log(iso);
        }

        // Test is in default too
        console.log(Object.keys(this));
        docPipeline(this); // WORKS

        $pipeline('extra', 
            async (mainScope) => 
            {
                console.log('======= PIPELINE EXTRA ======');
                console.log('==== Access mainBox from pipeline scope ====');
                
                console.log(mainBox); // This works: Because function defined in main scope ==> BUT mainBox is set on function definition (so not up to date!)
                console.log(mainBox.bbox().height());

                console.log(mainScope.mainBox); // This too: Because mainScope is the same as the main scope

                someFunction(); // Function is defined in main scope but executed in here,
                // so funcBox is placed in pipeline scope
                console.log(funcBox.bbox().height());

                extraSphere = sphere(50).move(200);
                console.log(extraSphere);

                iso = all().moveTo(1000);
                
            }    
        );

        $pipeline('techdraw',  docPipeline);        

    `,
    published: {
        version: "0.5",
    }

}