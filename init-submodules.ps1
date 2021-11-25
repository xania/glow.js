IF (-NOT (Test-Path 'mutabl.js/package.json') ) {
    git clone https://github.com/xania/mutabl.js.git mutabl.js
}

FUNCTION HasRemote($branch) {
    return git ls-remote | select-string -patt "refs/heads/$branch"
}

$parentBranch = &git rev-parse --abbrev-ref HEAD

Push-Location 'mutabl.js'

git fetch origin

IF (HasRemote -b $parentBranch) {
    git merge origin/$parentBranch
}

Pop-Location