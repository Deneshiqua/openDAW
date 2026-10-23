import {DefaultObservableValue, Errors, Option, RuntimeNotifier} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {WavFile} from "@opendaw/lib-dsp"
import {OfflineEngineRenderer} from "@opendaw/studio-core"
import {StudioService} from "@/service/StudioService"

// Ezgify (https://ezgify.com) edition of openDAW, served at daw.ezgify.com behind Ezgify's member gate.
// A song generated on Ezgify opens here as one track per separated stem (/ezgify/<song id>), and
// "Ezgify'a gönder" renders the edited mixdown and sends it back, where it shows up in the member's
// "My songs" as a new version marked as edited in openDAW. All requests go to this origin's
// /__ezgify/api/*, which Ezgify's gate forwards with the member's identity.

export type EzgifySong = { id: string, title: string }

/** This edition's source code, offered to every user of it (AGPL-3.0, section 13). */
export const EZGIFY_SOURCE_URL = "https://github.com/Deneshiqua/openDAW/tree/ezgify"

const STORAGE_KEY = "ezgify-song"
const API = "/__ezgify/api"

const restore = (): Option<EzgifySong> => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (raw === null) {return Option.None}
        const value = JSON.parse(raw) as EzgifySong
        return typeof value?.id === "string" && typeof value?.title === "string" ? Option.wrap(value) : Option.None
    } catch {
        return Option.None
    }
}

export namespace Ezgify {
    /** The Ezgify song the open project came from (per browser tab, survives a reload). */
    export const song = new DefaultObservableValue<Option<EzgifySong>>(restore())

    const remember = (value: Option<EzgifySong>) => {
        song.setValue(value)
        try {
            value.match({
                none: () => sessionStorage.removeItem(STORAGE_KEY),
                some: v => sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v))
            })
        } catch {/* storage blocked: only this page view knows the song */}
    }

    const fail = (headline: string, error: unknown) =>
        RuntimeNotifier.info({headline, message: error instanceof Error ? error.message : String(error)})

    /** Opens the member's Ezgify song `id` as a new project. */
    export const open = async (service: StudioService, id: string): Promise<void> => {
        const dialog = RuntimeNotifier.progress({headline: "Şarkı Ezgify'dan alınıyor..."})
        const result = await Promises.tryCatch((async () => {
            const response = await fetch(`${API}/songs/${encodeURIComponent(id)}`, {credentials: "same-origin"})
            if (!response.ok) {throw new Error(response.status === 404 ? "Şarkı bulunamadı." : `Ezgify yanıt vermedi (${response.status}).`)}
            const info = await response.json() as {
                id: string, title: string, bpm: number | null, stems: ReadonlyArray<{ name: string, url: string }>
            }
            const files: Array<{ name: string, arrayBuffer: ArrayBuffer }> = []
            for (const [index, stem] of info.stems.entries()) {
                dialog.message = `${stem.name} kanalı indiriliyor (${index + 1}/${info.stems.length})`
                const file = await fetch(stem.url, {credentials: "same-origin"})
                if (!file.ok) {throw new Error(`${stem.name} kanalı indirilemedi (${file.status}).`)}
                files.push({name: stem.name, arrayBuffer: await file.arrayBuffer()})
            }
            dialog.message = "Kanallar projeye ekleniyor..."
            await service.openAudioTracks(info.title, Option.wrap(info.bpm ?? undefined), files)
            remember(Option.wrap({id: info.id, title: info.title}))
        })())
        dialog.terminate()
        if (result.status === "rejected") {
            remember(Option.None)
            await fail("Şarkı açılamadı", result.error)
        }
    }

    /** Renders the open project and sends the mixdown to Ezgify as a new version of the song. */
    export const send = async (service: StudioService): Promise<void> => {
        const origin = song.getValue()
        if (origin.isEmpty() || !service.hasProfile) {
            return void RuntimeNotifier.info({
                headline: "Ezgify'a gönder",
                message: "Bu proje Ezgify'dan açılmadı. Ezgify'da şarkının yanındaki “openDAW'da aç” ile başla."
            })
        }
        const {id, title} = origin.unwrap()
        const approved = await RuntimeNotifier.approve({
            headline: "Ezgify'a gönder",
            message: `Düzenlediğin hâli “${title}” şarkısının yeni sürümü olarak Üretimlerim'e eklenecek. Orijinal şarkı olduğu gibi kalır.`,
            approveText: "Gönder",
            cancelText: "Vazgeç"
        })
        if (!approved) {return}

        const abortController = new AbortController()
        const progress = new DefaultObservableValue(0.0)
        const rendering = RuntimeNotifier.progress({
            headline: "Miks hazırlanıyor...", progress, cancel: () => abortController.abort()
        })
        await service.audioContext.suspend()
        const rendered = await Promises.tryCatch(OfflineEngineRenderer
            .start(service.project.copy(), Option.None, progress, abortController.signal, 48_000))
        await service.audioContext.resume()
        rendering.terminate()
        if (rendered.status === "rejected") {
            if (!Errors.isAbort(rendered.error)) {await fail("Miks hazırlanamadı", rendered.error)}
            return
        }

        const sending = RuntimeNotifier.progress({headline: "Ezgify'a gönderiliyor..."})
        const sent = await Promises.tryCatch(fetch(`${API}/songs/${encodeURIComponent(id)}/versions`, {
            method: "POST",
            credentials: "same-origin",
            headers: {"content-type": "audio/wav", "x-ezgify-title": encodeURIComponent(`${title} (openDAW)`)},
            body: WavFile.encodeInts16(rendered.value)
        }).then(async response => {
            if (!response.ok) {
                throw new Error(response.status === 429
                    ? "Bu saat için gönderme sınırına ulaştın. Biraz sonra tekrar dene."
                    : `Ezgify kabul etmedi (${response.status}).`)
            }
            return response.json() as Promise<{ id: string }>
        }))
        sending.terminate()
        if (sent.status === "rejected") {return fail("Gönderilemedi", sent.error)}
        await RuntimeNotifier.info({
            headline: "Ezgify'a gönderildi",
            message: "Yeni sürüm Üretimlerim'de “openDAW ile düzenlendi” etiketiyle görünüyor."
        })
    }
}
