import css from "./Dashboard.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "@opendaw/lib-dom"
import {EZGIFY_SITE} from "@/ezgify/Ezgify"

const className = Html.adoptStyleSheet(css, "Dashboard")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

// Ezgify edition: no projects, templates or demos here. Songs are edited by opening them from
// Ezgify ("openDAW'da aç"), and they go back there with "Ezgify'a gönder".
export const Dashboard = (_construct: Construct) => (
    <div className={className}>
        <div className="ezgify-home">
            <h1>Ezgify Stüdyo</h1>
            <p>
                Bir şarkıyı düzenlemek için Ezgify'da Üretimlerim'e git ve şarkının yanındaki
                “openDAW'da aç”a bas. Şarkı burada kanallarıyla açılır; düzenlemeyi bitirince
                “Ezgify'a gönder” ile Ezgify'a geri gönderirsin.
            </p>
            <a className="ezgify-home-button" href={`${EZGIFY_SITE}/create`}>Ezgify'a git</a>
        </div>
    </div>
)
