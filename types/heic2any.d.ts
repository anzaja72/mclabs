declare module "heic2any" {
    interface Options { blob: Blob; toType?: string; quality?: number }
    export default function heic2any(opts: Options): Promise<Blob | Blob[]>
}
