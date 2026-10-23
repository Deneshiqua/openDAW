import {createElement, PageContext, PageFactory} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Ezgify} from "@/ezgify/Ezgify"

// /ezgify/<song id>: Ezgify's "Open in openDAW" lands here (through its gate) and the song opens as
// a new project, one track per stem.
export const EzgifyOpenPage: PageFactory<StudioService> = ({service, path}: PageContext<StudioService>) => (
    <div onInit={async (_element: HTMLElement) => {
        const id = path.substring(path.lastIndexOf("/") + 1)
        history.replaceState(null, "", "/") // a reload must not open the song again
        await Ezgify.open(service, id)
    }}/>
)
