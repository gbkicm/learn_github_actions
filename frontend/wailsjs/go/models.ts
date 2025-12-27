export namespace main {
	
	export class CondenseOptions {
	    outputSuffix: string;
	    outputDir: string;
	    outputFormat: string;
	    vadThreshold: number;
	    minSilenceDuration: number;
	    speechPaddingMs: number;
	
	    static createFrom(source: any = {}) {
	        return new CondenseOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.outputSuffix = source["outputSuffix"];
	        this.outputDir = source["outputDir"];
	        this.outputFormat = source["outputFormat"];
	        this.vadThreshold = source["vadThreshold"];
	        this.minSilenceDuration = source["minSilenceDuration"];
	        this.speechPaddingMs = source["speechPaddingMs"];
	    }
	}

}

