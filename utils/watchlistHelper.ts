import { WatchlistPage } from '../pages/WatchlistPage';

export async function prepareStock(
    watchlistPage: WatchlistPage
) {

    await watchlistPage.gotoWatchlistPage();

    await watchlistPage.searchStock('1010');

    await watchlistPage.addStock();

//     await watchlistPage.closePopup();
// }
}