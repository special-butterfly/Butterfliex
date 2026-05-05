import os
import http.server
import socketserver
from http import HTTPStatus

class RangeRequestHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        f = None
        if os.path.isdir(path):
            parts = http.server.urllib.parse.urlsplit(self.path)
            if not parts.path.endswith('/'):
                self.send_response(HTTPStatus.MOVED_PERMANENTLY)
                self.send_header("Location", self.path + "/")
                self.end_headers()
                return None
            for index in "index.html", "index.htm":
                index = os.path.join(path, index)
                if os.path.exists(index):
                    path = index
                    break
            else:
                return self.list_directory(path)
        ctype = self.guess_type(path)
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None

        try:
            fs = os.fstat(f.fileno())
            file_len = fs[6]
            if 'Range' in self.headers:
                range_match = self.headers['Range']
                range_match = range_match.replace('bytes=', '')
                start, end = range_match.split('-')
                start = int(start) if start else 0
                end = int(end) if end else file_len - 1
                length = end - start + 1
                self.send_response(HTTPStatus.PARTIAL_CONTENT)
                self.send_header("Content-type", ctype)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_len}")
                self.send_header("Content-Length", str(length))
                self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
                self.end_headers()
                f.seek(start)
                return f
            else:
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-type", ctype)
                self.send_header("Content-Length", str(fs[6]))
                self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
                self.end_headers()
                return f
        except:
            f.close()
            raise

    def copyfile(self, source, outputfile):
        if 'Range' in self.headers:
            range_match = self.headers['Range']
            range_match = range_match.replace('bytes=', '')
            start, end = range_match.split('-')
            start = int(start) if start else 0
            end = int(end) if end else os.fstat(source.fileno())[6] - 1
            length = end - start + 1
            outputfile.write(source.read(length))
        else:
            http.server.SimpleHTTPRequestHandler.copyfile(self, source, outputfile)

if __name__ == '__main__':
    PORT = 8001
    Handler = RangeRequestHandler
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()
