import {Probot} from "probot";
import {registerInstallationHandlers} from "./handlers/installation.js";
import {registerCheckHandlers} from "./handlers/checks.js";

export default (app: Probot) => {
    app.onAny(async (context) => {
        console.log(`Event ${context.name} received`);
    })

    registerInstallationHandlers(app);
    registerCheckHandlers(app);
};
